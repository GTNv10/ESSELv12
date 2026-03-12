// js/pdf-logic.js — Exportación PDF y Excel

import { state, saveData } from './state.js';
import { elements } from './elements.js';
import { showToast, parseDate, formatDate, getFormattedDateForFilename, getFormattedTimestampForFilename } from './utils.js';
import { showPdfFilenameModal } from './ui-render.js';

// --- FLUJO DE GENERACIÓN PDF ---
let uploadedImagesArray = []; // Almacena base64 de las imágenes subidas
let currentDraggedItemIndex = null; // Para el reordenado

export function generatePDF() {
    const template = state.selectedTemplateId ? state.appData.templates.find(t => t.id === state.selectedTemplateId) : null;
    const rowData = state.selectedRowId ? state.appData.mainData.find(r => r.id === state.selectedRowId) : null;
    if (!template || !rowData) return showToast('Debes seleccionar una fila y una plantilla.', 'error');

    state.pendingPDFGeneration = { template, rowData, uploadedImages: {} };
    const imageFields = template.imageFields || [];
    const manualVars = template.manualFields || [];

    if (imageFields.length > 0) promptForImages(imageFields);
    else if (manualVars.length > 0) promptForManualVars(manualVars);
    else processAndShowPreview();
}

function promptForImages(imageFields) {
    uploadedImagesArray = [];
    currentDraggedItemIndex = null;

    document.getElementById('required-image-count').textContent = 'Opcional';
    document.getElementById('uploaded-image-count').textContent = '0';

    const dropzone = document.getElementById('image-dropzone');
    const fileInput = document.getElementById('global-image-input');

    // Remover event listeners antiguos clonando el nodo para evitar múltiples listeners
    const newDropzone = dropzone.cloneNode(true);
    dropzone.parentNode.replaceChild(newDropzone, dropzone);
    const newFileInput = newDropzone.querySelector('input[type="file"]');

    const handleFiles = (files) => {
        // Filtrar solo archivos de imagen primero
        const imageFiles = Array.from(files).filter(f => f && f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        // Reservar posiciones en el array ANTES de leer (FileReader es asíncrono,
        // sin esto el orden de inserción dependería del tiempo de carga de cada archivo)
        const startIndex = uploadedImagesArray.length;
        uploadedImagesArray.push(...new Array(imageFiles.length).fill(null));

        let loadedCount = 0;
        imageFiles.forEach((file, i) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedImagesArray[startIndex + i] = e.target.result; // insertar en posición correcta
                loadedCount++;
                if (loadedCount === imageFiles.length) {
                    // Limpiar posibles nulos (por si acaso) y re-renderizar solo cuando todas cargaron
                    uploadedImagesArray = uploadedImagesArray.filter(img => img !== null);
                    renderImageGrid(imageFields);
                }
            };
            reader.readAsDataURL(file);
        });
    };

    newFileInput.onchange = (e) => handleFiles(e.target.files);
    newDropzone.onclick = () => newFileInput.click();

    newDropzone.ondragover = (e) => {
        e.preventDefault();
        newDropzone.classList.add('border-sky-500', 'bg-sky-100', 'dark:bg-sky-900/40');
    };
    newDropzone.ondragleave = () => {
        newDropzone.classList.remove('border-sky-500', 'bg-sky-100', 'dark:bg-sky-900/40');
    };
    newDropzone.ondrop = (e) => {
        e.preventDefault();
        newDropzone.classList.remove('border-sky-500', 'bg-sky-100', 'dark:bg-sky-900/40');
        handleFiles(e.dataTransfer.files);
    };

    renderImageGrid(imageFields);
    elements.imageUploadModal.classList.add('active');
}

function renderImageGrid(imageFields) {
    const grid = document.getElementById('image-preview-grid');
    const hint = document.getElementById('drag-reorder-hint');
    const countDisplay = document.getElementById('uploaded-image-count');

    countDisplay.textContent = uploadedImagesArray.length;
    grid.innerHTML = '';

    if (uploadedImagesArray.length > 1) {
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }

    uploadedImagesArray.forEach((imgBase64, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item relative aspect-[4/3] rounded-2xl bg-gray-100 dark:bg-gray-800 shadow-md group grab-cursor';
        item.draggable = true;
        item.dataset.index = index;

        const img = document.createElement('img');
        img.src = imgBase64;
        img.className = 'w-full h-full object-cover rounded-2xl';

        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-img-btn opacity-0 group-hover:opacity-100 transition-opacity';
        deleteBtn.innerHTML = '✕';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            uploadedImagesArray.splice(index, 1);
            renderImageGrid(imageFields);
        };

        let labelText = `Imagen ${index + 1}`;
        if (index < imageFields.length) {
            labelText = `${imageFields[index]} (Adjunto ${index + 1})`;
        } else if (imageFields.length > 0) {
            labelText = `${imageFields[0]} (Adjunto ${index + 1})`; // Agrupar adicionales en el primer campo
        } else {
            labelText = `Imagen Adicional`;
        }

        const label = document.createElement('div');
        label.className = 'field-label';
        label.textContent = labelText;

        item.appendChild(img);
        item.appendChild(deleteBtn);
        item.appendChild(label);

        // --- Eventos de Drag & Drop para Reordenar ---
        item.addEventListener('dragstart', (e) => {
            currentDraggedItemIndex = index;
            setTimeout(() => item.classList.add('dragging'), 0);
            item.classList.remove('grab-cursor');
            item.classList.add('grabbing-cursor');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            currentDraggedItemIndex = null;
            item.classList.remove('dragging', 'grabbing-cursor');
            item.classList.add('grab-cursor');
            document.querySelectorAll('.preview-item').forEach(el => el.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necesario para permitir el drop
            e.dataTransfer.dropEffect = 'move';
            if (currentDraggedItemIndex !== null && currentDraggedItemIndex !== index) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            if (currentDraggedItemIndex !== null && currentDraggedItemIndex !== index) {
                // Reordenar array
                const draggedElementStr = uploadedImagesArray[currentDraggedItemIndex];
                uploadedImagesArray.splice(currentDraggedItemIndex, 1);
                uploadedImagesArray.splice(index, 0, draggedElementStr);
                renderImageGrid(imageFields);
            }
        });

        grid.appendChild(item);
    });
}

export function promptForManualVars(manualVars) {
    const manualVarsForm = document.getElementById('manual-vars-form');
    manualVarsForm.innerHTML = '';
    manualVars.forEach(varName => {
        const label = document.createElement('label');
        label.className = "block";
        label.innerHTML = `<span class="text-sm font-semibold text-gray-700 dark:text-gray-300">${varName}</span><input type="text" name="${varName}" class="mt-1 w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">`;
        manualVarsForm.appendChild(label);
    });
    elements.manualVarsModal.classList.add('active');
}

export function processAndShowPreview() {
    if (!state.pendingPDFGeneration) return;
    let { template, rowData } = state.pendingPDFGeneration;
    let content = template.content;
    const manualValues = {};
    const manualVarsForm = document.getElementById('manual-vars-form');
    if (elements.manualVarsModal.classList.contains('active')) {
        const formData = new FormData(manualVarsForm);
        for (let [key, value] of formData.entries()) manualValues[key] = value;
    }

    // Mapeo dinámico: Las imágenes subidas y ordenadas se asignan a los campos
    const imageFields = template.imageFields || [];
    let imageMap = {};

    // Si hay un solo campo de imagen en la plantilla, asignarle todas las imágenes
    if (imageFields.length === 1) {
        imageMap[imageFields[0]] = [...uploadedImagesArray];
    } else {
        // Fallback si hay múltiples campos: asignar 1 a 1, y las sobrantes al último campo
        imageFields.forEach((fieldName, index) => {
            if (uploadedImagesArray[index]) {
                if (!imageMap[fieldName]) imageMap[fieldName] = [];
                imageMap[fieldName].push(uploadedImagesArray[index]);
            }
        });

        // Imágenes adicionales que superan la cantidad de campos
        if (uploadedImagesArray.length > imageFields.length && imageFields.length > 0) {
            const lastFieldName = imageFields[imageFields.length - 1];
            for (let i = imageFields.length; i < uploadedImagesArray.length; i++) {
                imageMap[lastFieldName].push(uploadedImagesArray[i]);
            }
        }
    }

    state.pendingPDFGeneration.uploadedImages = imageMap; // Guardar el mapa de arrays para downloadPDF()

    const finalContent = content.replace(/\{\{(IMAGEN:)?(.*?)\}\}/g, (_, isImage, key) => {
        key = key.trim();
        if (isImage) return ''; // En la vista previa se ocultan los placeholders de imágenes
        if (manualValues.hasOwnProperty(key)) return manualValues[key];
        if (rowData.hasOwnProperty(key)) { const value = String(rowData[key] ?? ''); return value.trim() ? value : ''; }
        return `{{${key}}}`;
    });
    elements.manualVarsModal.classList.remove('active');
    elements.imageUploadModal.classList.remove('active');
    state.pendingPDFGeneration.finalContent = finalContent;

    // Limpiar el array global temporal
    uploadedImagesArray = [];
    currentDraggedItemIndex = null;

    showPreview(finalContent);
}

function showPreview(content) {
    const previewText = document.getElementById('preview-text');
    // Replicar algo de la lógica visual para el modal HTML
    let htmlContent = content
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-2 mb-1" style="text-align:left;">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-3 mb-2" style="text-align:left;">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-3" style="text-align:left;">$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/\n\n+/g, '</p><p class="mb-3">')
        .replace(/\n/g, '<br>');

    previewText.innerHTML = `<div style="text-align: justify; line-height: 1.5;"><p class="mb-3">${htmlContent}</p></div>`;
    elements.previewModal.classList.add('active');
}

function generatePdfFilename() {
    const { rowData, template } = state.pendingPDFGeneration;
    let filename = state.appData.pdfFilenameFormat || 'Documento.pdf';
    const manualValues = {};
    const formElement = document.getElementById('manual-vars-form');
    if (formElement && formElement.elements.length > 0) {
        const formData = new FormData(formElement);
        for (let [key, value] of formData.entries()) manualValues[key] = value;
    }
    filename = filename.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        key = key.trim();
        if (manualValues.hasOwnProperty(key)) return manualValues[key];
        if (rowData.hasOwnProperty(key)) { const value = String(rowData[key] ?? ''); return value.trim() ? value : ''; }
        if (key.toLowerCase() === 'fecha_actual') return getFormattedDateForFilename();
        if (key.toLowerCase() === 'nombre_plantilla') return template.name;
        return '';
    });
    filename = filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ');
    return `${filename}.pdf`;
}

export async function downloadPDF() {
    if (!state.pendingPDFGeneration) return;
    const { template, uploadedImages } = state.pendingPDFGeneration;
    const initialFilename = generatePdfFilename();

    let finalFilename = initialFilename;
    if (!state.appData.autoAcceptPdfFilename) {
        const result = await showPdfFilenameModal(initialFilename);
        if (!result) return;
        finalFilename = result.filename;
        if (result.autoAccept) {
            state.appData.autoAcceptPdfFilename = true;
            saveData(document.getElementById('temporal-mode-checkbox'));
        }
    }

    try {
        if (!window.jspdf) {
            showToast('La librería PDF todavía está cargando. Reintentá en unos segundos.', 'warning');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const margin = 20;
        const usableWidth = doc.internal.pageSize.getWidth() - (2 * margin);
        const pageHeight = doc.internal.pageSize.getHeight();
        const baseFontSize = 12;
        const fontName = template.hasOwnProperty('fontFamily') && template.fontFamily ? template.fontFamily : 'Helvetica';

        let cursorY = margin;

        const addPageIfNeeded = (requiredHeight) => {
            if (cursorY + requiredHeight > pageHeight - margin) {
                doc.addPage();
                cursorY = margin;
                return true;
            }
            return false;
        };

        const getFontStyle = (bold, italic) => { if (bold && italic) return 'bolditalic'; if (bold) return 'bold'; if (italic) return 'italic'; return 'normal'; };

        // Nuevo parseador Markdown con Regex (más robusto que split)
        const parseMarkdown = (text) => {
            const tokens = [];
            let i = 0;
            let currentText = '';
            let isBold = false;
            let isItalic = false;

            while (i < text.length) {
                if (text.substring(i, i + 2) === '**') {
                    if (currentText) tokens.push({ text: currentText, bold: isBold, italic: isItalic });
                    currentText = '';
                    isBold = !isBold;
                    i += 2;
                } else if (text[i] === '*') {
                    if (currentText) tokens.push({ text: currentText, bold: isBold, italic: isItalic });
                    currentText = '';
                    isItalic = !isItalic;
                    i++;
                } else {
                    currentText += text[i];
                    i++;
                }
            }
            if (currentText) tokens.push({ text: currentText, bold: isBold, italic: isItalic });
            return tokens;
        };

        // Calcula el ancho total de una palabra (puede estar compuesta de múltiples tokens con distintos estilos)
        const calculateWordWidth = (wordTokens, currentFontSize) => {
            let width = 0;
            doc.setFontSize(currentFontSize);
            wordTokens.forEach(token => {
                doc.setFont(fontName, getFontStyle(token.bold, token.italic));
                width += doc.getStringUnitWidth(token.text) * currentFontSize / doc.internal.scaleFactor;
            });
            return width;
        };

        // Renderiza una línea alineada justificadamente (o a la izquierda si es la última del párrafo)
        const renderLine = (lineWords, y, currentFontSize, isLastLine) => {
            doc.setFontSize(currentFontSize);
            const spaceWidth = doc.getStringUnitWidth(' ') * currentFontSize / doc.internal.scaleFactor;
            let totalWordsWidth = lineWords.reduce((sum, word) => sum + word.width, 0);

            let extraSpacePerWord = 0;
            // Solo justificar si no es la última línea del párrafo y hay más de 1 palabra
            if (!isLastLine && lineWords.length > 1) {
                const emptySpace = usableWidth - totalWordsWidth;
                extraSpacePerWord = emptySpace / (lineWords.length - 1);
            } else {
                extraSpacePerWord = spaceWidth; // Alineación izquierda normal
            }

            let currentX = margin;
            lineWords.forEach((word) => {
                word.tokens.forEach(token => {
                    doc.setFont(fontName, getFontStyle(token.bold, token.italic));
                    doc.text(token.text, currentX, y);
                    currentX += doc.getStringUnitWidth(token.text) * currentFontSize / doc.internal.scaleFactor;
                });
                currentX += extraSpacePerWord; // Añadir el espacio (justificado o normal) entre palabras
            });
        };

        const processParagraph = (paragraph, options = {}) => {
            if (!paragraph || paragraph.trim() === '') {
                cursorY += options.lineHeight || (baseFontSize * 1.5 * 0.352778);
                return;
            }

            const isHeading1 = paragraph.startsWith('# ');
            const isHeading2 = paragraph.startsWith('## ');
            const isHeading3 = paragraph.startsWith('### ');

            let cleanParagraph = paragraph;
            let currentFontSize = baseFontSize;
            let isGlobalBold = false;
            let postParagraphSpacing = 4; // Espacio extra después de cada párrafo (en mm)

            if (isHeading1) {
                cleanParagraph = paragraph.substring(2);
                currentFontSize = baseFontSize + 6;
                isGlobalBold = true;
                postParagraphSpacing = 6;
                cursorY += 4; // Margen superior extra para Título 1
            } else if (isHeading2) {
                cleanParagraph = paragraph.substring(3);
                currentFontSize = baseFontSize + 4;
                isGlobalBold = true;
                postParagraphSpacing = 5;
                cursorY += 2;
            } else if (isHeading3) {
                cleanParagraph = paragraph.substring(4);
                currentFontSize = baseFontSize + 2;
                isGlobalBold = true;
                postParagraphSpacing = 4;
            }

            const currentLineHeight = (currentFontSize * 1.5) * 0.352778; // Interlineado 1.5
            addPageIfNeeded(currentLineHeight);

            const tokens = parseMarkdown(cleanParagraph);
            if (isGlobalBold) tokens.forEach(t => t.bold = true);

            // Reensamblar en palabras manteniendola estructura de tokens
            const words = [];
            let currentWordTokens = [];

            tokens.forEach(token => {
                const tokenWords = token.text.split(/(\s+)/);
                tokenWords.forEach(tw => {
                    if (tw.trim() === '') {
                        if (currentWordTokens.length > 0) {
                            words.push({ tokens: currentWordTokens, width: calculateWordWidth(currentWordTokens, currentFontSize) });
                            currentWordTokens = [];
                        }
                    } else {
                        currentWordTokens.push({ text: tw, bold: token.bold, italic: token.italic });
                    }
                });
            });
            if (currentWordTokens.length > 0) {
                words.push({ tokens: currentWordTokens, width: calculateWordWidth(currentWordTokens, currentFontSize) });
            }

            // Wrapping
            const lines = [];
            let currentLineWords = [];
            let currentLineWidth = 0;
            const spaceWidth = (doc.getStringUnitWidth(' ') * currentFontSize / doc.internal.scaleFactor) * 0.9; // Base space

            words.forEach(word => {
                const widthIfAdded = currentLineWidth + (currentLineWords.length > 0 ? spaceWidth : 0) + word.width;
                if (widthIfAdded > usableWidth && currentLineWords.length > 0) {
                    lines.push(currentLineWords);
                    currentLineWords = [word];
                    currentLineWidth = word.width;
                } else {
                    currentLineWords.push(word);
                    currentLineWidth += (currentLineWords.length > 1 ? spaceWidth : 0) + word.width;
                }
            });
            if (currentLineWords.length > 0) lines.push(currentLineWords);

            // Renderizado de líneas
            lines.forEach((line, index) => {
                const isLastLine = index === lines.length - 1;
                addPageIfNeeded(currentLineHeight);
                // Si es un título, nunca lo justificamos (queda raro), lo alineamos a la izquierda
                const forceLeftAlign = isLastLine || isHeading1 || isHeading2 || isHeading3;
                renderLine(line, cursorY, currentFontSize, forceLeftAlign);
                cursorY += currentLineHeight;
            });

            // Espaciado post-párrafo
            cursorY += postParagraphSpacing;
        };

        // --- FIN PARSER MEJORADO ---

        doc.setFontSize(baseFontSize);
        
        const contentWithPlaceholders = state.pendingPDFGeneration.template.content;
        // Build manualValues once (not per-placeholder inside replace() callback)
        const manualValues = {};
        const manualVarsForm = document.getElementById('manual-vars-form');
        if (manualVarsForm && manualVarsForm.elements.length > 0) {
            const fd = new FormData(manualVarsForm);
            for (let [k, v] of fd.entries()) manualValues[k] = v;
        }
        const finalRenderableContent = contentWithPlaceholders.replace(/\{\{(?!IMAGEN:)(.*?)\}\}/g, (_, key) => {
            key = key.trim();
            if (manualValues.hasOwnProperty(key)) return manualValues[key];
            if (state.pendingPDFGeneration.rowData.hasOwnProperty(key)) { const value = String(state.pendingPDFGeneration.rowData[key] ?? ''); return value.trim() ? value : ''; }
            return '';
        });
        const parts = finalRenderableContent.split(/(\{\{IMAGEN:.*?\}\})/g);
        
        for (const part of parts) {
            if (part.startsWith('{{IMAGEN:')) {
                const imageName = part.slice(9, -2).trim();
                const base64Images = uploadedImages[imageName];

                if (base64Images && Array.isArray(base64Images) && base64Images.length > 0) {
                    base64Images.forEach((base64Image, index) => {
                        const imgProps = doc.getImageProperties(base64Image);
                        const aspectRatio = imgProps.width / imgProps.height;
                        let imgWidth = usableWidth;
                        let imgHeight = imgWidth / aspectRatio;
                        const maxImgHeight = pageHeight / 2;

                        // Si la imagen no cabe en la página actual, saltar a la siguiente
                        addPageIfNeeded(imgHeight + (baseFontSize * 1.5 * 0.352778));

                        if (imgHeight > maxImgHeight) {
                            imgHeight = maxImgHeight;
                            imgWidth = imgHeight * aspectRatio;
                        }

                        doc.addImage(base64Image, 'JPEG', margin, cursorY, imgWidth, imgHeight);
                        cursorY += imgHeight + (baseFontSize * 1.5 * 0.352778);

                        // Añadir un poco de espacio extra entre múltiples imágenes del mismo bloque, salvo la última
                        if (index < base64Images.length - 1) {
                            cursorY += baseFontSize * 1.5 * 0.352778;
                            addPageIfNeeded(baseFontSize * 1.5 * 0.352778);
                        }
                    });
                }
            } else {
                const paragraphs = part.split('\n');
                paragraphs.forEach(paragraph => {
                    processParagraph(paragraph);
                });
            }
        }
        doc.save(finalFilename);
        showToast('PDF generado correctamente.', 'success');
    } catch (e) {
        console.error("Error al generar PDF:", e);
        showToast('Hubo un error inesperado al generar el PDF.', 'error');
    } finally {
        elements.previewModal.classList.remove('active');
        state.pendingPDFGeneration = null;
    }
}

// --- EXCEL ---

export function exportDataToExcel(data, filename) {
    if (data.length === 0) { showToast("No hay datos para exportar.", "warning"); return false; }
    if (!window.XLSX) { showToast('La librería Excel todavía está cargando. Reintentá en unos segundos.', 'warning'); return false; }
    const XLSX = window.XLSX;
    const dataToExport = data.map(row => { const exportRow = {}; state.appData.headers.forEach(h => { exportRow[h] = row[h]; }); return exportRow; });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport, { header: state.appData.headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Datos");
    XLSX.writeFile(workbook, filename);
    return true;
}

export function exportFilteredToExcel() {
    elements.loadingOverlay.classList.add('active');
    setTimeout(() => {
        const filename = `gtn_datos_filtrados_${getFormattedDateForFilename()}.xlsx`;
        const success = exportDataToExcel(state.filteredData, filename);
        if (success) showToast('Datos exportados a Excel.', 'success');
        elements.loadingOverlay.classList.remove('active');
    }, 50);
}

export function exportDb() {
    const dataStr = JSON.stringify(state.appData.referenceDB, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'gtn_db_backup.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('Base de datos de referencia exportada.', 'success');
}

export function exportAllData() {
    elements.loadingOverlay.classList.add('active');
    setTimeout(() => {
        const dataStr = JSON.stringify(state.appData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `gtn_v10_backup_completo_${getFormattedTimestampForFilename()}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('Copia de seguridad completa exportada.', 'success');
        elements.loadingOverlay.classList.remove('active');
    }, 50);
}

export function importAllData(event) {
    const file = event.target.files[0];
    if (!file) return;
    elements.loadingOverlay.classList.add('active');
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (parsed.headers && parsed.mainData) {
                // Import showConfirmModal dynamically to avoid circular dep at module load time
                import('./ui-render.js').then(({ showConfirmModal }) => {
                    showConfirmModal('Esto reemplazará TODOS los datos y ajustes actuales con el contenido del archivo. ¿Continuar?', () => {
                        state.appData = parsed;
                        saveData(elements.temporalModeCheckbox);
                        showToast('Copia de seguridad restaurada. La página se recargará.', 'success');
                        setTimeout(() => location.reload(), 1500);
                    }, 'Restaurar Copia de Seguridad');
                });
            } else { showToast('Archivo de copia de seguridad no válido.', 'error'); }
        } catch (err) { showToast('Error al leer el archivo. No parece ser un backup válido.', 'error'); console.error(err); }
        finally { elements.loadingOverlay.classList.remove('active'); }
    };
    reader.onerror = () => { showToast('Error al leer el archivo.', 'error'); elements.loadingOverlay.classList.remove('active'); };
    reader.readAsText(file);
    event.target.value = '';
}
