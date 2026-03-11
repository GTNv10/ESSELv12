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
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    uploadedImagesArray.push(e.target.result);
                    renderImageGrid(imageFields);
                };
                reader.readAsDataURL(file);
            }
        }
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
    previewText.innerHTML = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
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
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const margin = 20;
        const usableWidth = doc.internal.pageSize.getWidth() - (2 * margin);
        const pageHeight = doc.internal.pageSize.getHeight();
        const fontSize = 12;
        const lineHeight = (fontSize * 1.3) * 0.352778;
        let cursorY = margin;
        const addPageIfNeeded = (requiredHeight) => { if (cursorY + requiredHeight > pageHeight - margin) { doc.addPage(); cursorY = margin; return true; } return false; };
        const parseStyledText = (text) => {
            const parts = [];
            text.split('**').forEach((segment, boldIndex) => {
                const isBold = boldIndex % 2 !== 0;
                segment.split('*').forEach((subSegment, italicIndex) => {
                    const isItalic = italicIndex % 2 !== 0;
                    if (subSegment.length > 0) parts.push({ text: subSegment, bold: isBold, italic: isItalic });
                });
            });
            return parts;
        };
        const getFontStyle = (bold, italic) => { if (bold && italic) return 'bolditalic'; if (bold) return 'bold'; if (italic) return 'italic'; return 'normal'; };
        const writeLineWithMarkdown = (line, x) => {
            let currentX = x;
            const segments = parseStyledText(line);
            for (const segment of segments) {
                doc.setFont(template.fontFamily || 'Helvetica', getFontStyle(segment.bold, segment.italic));
                const tokens = segment.text.split(/(\s+)/);
                for (const token of tokens) {
                    if (token.length === 0) continue;
                    const tokenWidth = doc.getStringUnitWidth(token) * fontSize / doc.internal.scaleFactor;
                    if (currentX + tokenWidth > x + usableWidth) { cursorY += lineHeight; addPageIfNeeded(lineHeight); currentX = x; }
                    doc.text(token, currentX, cursorY);
                    currentX += tokenWidth;
                }
            }
            doc.setFont(template.fontFamily || 'Helvetica', 'normal');
        };
        doc.setFont(template.fontFamily || 'Helvetica', 'normal');
        doc.setFontSize(fontSize);
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
                        addPageIfNeeded(imgHeight + lineHeight);

                        if (imgHeight > maxImgHeight) {
                            imgHeight = maxImgHeight;
                            imgWidth = imgHeight * aspectRatio;
                        }

                        doc.addImage(base64Image, 'JPEG', margin, cursorY, imgWidth, imgHeight);
                        cursorY += imgHeight + lineHeight;

                        // Añadir un poco de espacio extra entre múltiples imágenes del mismo bloque, salvo la última
                        if (index < base64Images.length - 1) {
                            cursorY += lineHeight;
                            addPageIfNeeded(lineHeight);
                        }
                    });
                }
            } else {
                const paragraphs = part.split('\n');
                paragraphs.forEach((paragraph, pIndex) => {
                    if (paragraph.trim() === '') { if (pIndex < paragraphs.length - 1) { cursorY += lineHeight; addPageIfNeeded(lineHeight); } return; }
                    addPageIfNeeded(lineHeight);
                    writeLineWithMarkdown(paragraph, margin);
                    cursorY += lineHeight;
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
