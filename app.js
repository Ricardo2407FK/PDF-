// Set the workerSrc to the path of the PDF.js worker script.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js';

// --- STATE MANAGEMENT ---
let currentPdfBytes = null;
let activeTool = null; // 'text', 'rect', 'circle', 'draw', null
let fontCache = {};
let selectedElement = null;
let offsetX, offsetY;
let textElementsState = [];
let imageElementsState = [];
let shapeElementsState = [];
let isDrawing = false;
let lastX, lastY;

// --- UTILITY FUNCTIONS ---
function setActiveTool(tool) {
    if (activeTool === tool) {
        activeTool = null; // Toggle off if clicking the same tool
    } else {
        activeTool = tool;
    }

    // Deactivate all modes and layers first
    document.querySelectorAll('.drawing-canvas').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.text-overlay').forEach(o => o.style.pointerEvents = 'none');

    // Activate the selected tool's layer
    if (activeTool === 'draw') {
        document.querySelectorAll('.drawing-canvas').forEach(c => c.style.display = 'block');
    } else if (['text', 'rect', 'circle'].includes(activeTool)) {
        document.querySelectorAll('.text-overlay').forEach(o => o.style.pointerEvents = 'auto');
    }

    updateContextToolbar();
}

// --- INITIALIZATION & FILE HANDLING ---
document.getElementById('upload-btn').addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('welcome-upload-btn').addEventListener('click', () => document.getElementById('file-input').click());

const welcomeScreen = document.getElementById('welcome-screen');
['dragover', 'dragleave', 'drop'].forEach(eventName => welcomeScreen.addEventListener(eventName, (e) => e.preventDefault()));
welcomeScreen.addEventListener('dragover', () => welcomeScreen.classList.add('dragging-over'));
welcomeScreen.addEventListener('dragleave', () => welcomeScreen.classList.remove('dragging-over'));
welcomeScreen.addEventListener('drop', (e) => {
    welcomeScreen.classList.remove('dragging-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async () => { currentPdfBytes = new Uint8Array(reader.result); await renderPdf(currentPdfBytes); };
        reader.readAsArrayBuffer(file);
    } else {
        alert('Please drop a valid PDF file.');
    }
});

document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async () => { currentPdfBytes = new Uint8Array(reader.result); await renderPdf(currentPdfBytes); };
        reader.readAsArrayBuffer(file);
    } else {
        alert('Please select a valid PDF file.');
    }
});

document.getElementById('image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
        const reader = new FileReader();
        reader.onload = () => {
            imageElementsState.push({ id: `image-${Date.now()}`, src: reader.result, x: 10, y: 10, width: 200, height: 'auto', pageNum: 1 });
            renderImageElements();
        };
        reader.readAsArrayBuffer(file);
    } else {
        alert('Please select a valid JPG or PNG image.');
    }
});


// --- TOOLBAR ACTIONS ---
document.getElementById('add-page-btn').addEventListener('click', async () => {
    if (!currentPdfBytes) return alert("Please load a PDF first.");
    const pdfDoc = await PDFLib.PDFDocument.load(currentPdfBytes);
    pdfDoc.addPage();
    currentPdfBytes = await pdfDoc.save();
    await renderPdf(currentPdfBytes);
});
document.getElementById('add-text-btn').addEventListener('click', () => setActiveTool('text'));
document.getElementById('add-image-btn').addEventListener('click', () => document.getElementById('image-input').click());
document.getElementById('draw-btn').addEventListener('click', () => setActiveTool('draw'));
document.getElementById('add-rect-btn').addEventListener('click', () => setActiveTool('rect'));
document.getElementById('add-circle-btn').addEventListener('click', () => setActiveTool('circle'));

// --- INTERACTION HANDLERS ---
document.getElementById('pdf-viewer').addEventListener('click', (event) => {
    const targetIsOverlay = event.target.classList.contains('text-overlay');

    if (targetIsOverlay && ['text', 'rect', 'circle'].includes(activeTool)) {
        const rect = event.target.getBoundingClientRect();
        const pageNum = parseInt(event.target.dataset.pageNumber, 10);
        const commonProps = { x: event.clientX - rect.left, y: event.clientY - rect.top, pageNum };

        if (activeTool === 'text') {
            textElementsState.push({
                ...commonProps, id: `text-${Date.now()}`,
                text: document.getElementById('text-input').value || 'New Text',
                font: document.getElementById('font-select').value,
                fontSize: parseInt(document.getElementById('font-size-input').value, 10),
                color: document.getElementById('font-color-input').value
            });
            renderTextElements();
        } else { // It's a shape
            shapeElementsState.push({
                ...commonProps, id: `shape-${Date.now()}`, type: activeTool,
                width: 100, height: 100,
                fill: document.getElementById('shape-fill-color-input').value,
                border: document.getElementById('shape-border-color-input').value,
                borderWidth: parseInt(document.getElementById('shape-border-thickness-input').value, 10),
            });
            renderShapeElements();
        }
        setActiveTool(null); // Deactivate tool after placing
    } else if (!event.target.closest('.text-overlay > div, .shape-container, .image-container')) {
        if (selectedElement) {
            selectedElement.classList.remove('selected');
            selectedElement = null;
        }
    }
});

function setupDrawingCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const onMouseDown = (e) => { isDrawing = true; [lastX, lastY] = [e.offsetX, e.offsetY]; };
    const onMouseMove = (e) => {
        if (!isDrawing) return;
        Object.assign(ctx, { strokeStyle: document.getElementById('draw-color-input').value, lineWidth: document.getElementById('draw-thickness-input').value, lineCap: 'round' });
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
    };
    const onMouseUpOrOut = () => { isDrawing = false; };
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUpOrOut);
    canvas.addEventListener('mouseout', onMouseUpOrOut);
}

// --- RENDERING CORE ---
async function renderPdf(pdfBytes) {
    try {
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('content-area').classList.remove('hidden');
        const pdf = await pdfjsLib.getDocument(pdfBytes).promise;

        const viewer = document.getElementById('pdf-viewer');
        viewer.innerHTML = '';

        const pageRenderPromises = Array.from({ length: pdf.numPages }, (_, i) => {
            const pageNum = i + 1;
            return pdf.getPage(pageNum).then(page => {
                const pageContainer = document.createElement('div');
                pageContainer.className = 'page-container';
                pageContainer.dataset.pageNumber = pageNum;

                const canvas = document.createElement('canvas');
                const viewport = page.getViewport({ scale: 1.5 });
                Object.assign(canvas, { width: viewport.width, height: viewport.height });

                const textOverlay = document.createElement('div');
                textOverlay.className = 'text-overlay';
                textOverlay.dataset.pageNumber = pageNum;
                Object.assign(textOverlay.style, { width: `${viewport.width}px`, height: `${viewport.height}px` });

                const drawingCanvas = document.createElement('canvas');
                drawingCanvas.className = 'drawing-canvas';
                Object.assign(drawingCanvas, { width: viewport.width, height: viewport.height });

                pageContainer.append(canvas, textOverlay, drawingCanvas);
                viewer.appendChild(pageContainer);

                return page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            });
        });

        await Promise.all(pageRenderPromises);

        await renderThumbnails(pdf); // Render thumbnails after main pages are setup

        renderTextElements();
        renderImageElements();
        renderShapeElements();
        setActiveTool(null);
    } catch (error) {
        console.error("Error rendering PDF:", error);
        alert("Failed to render PDF. It may be corrupted or invalid.");
    }
}

async function renderThumbnails(pdf) {
    const thumbnailContainer = document.getElementById('thumbnail-container');
    const existingSortable = Sortable.get(thumbnailContainer);
    if(existingSortable) existingSortable.destroy();
    thumbnailContainer.innerHTML = '';

    const newThumbnailContainer = thumbnailContainer.cloneNode(false);
    thumbnailContainer.parentNode.replaceChild(newThumbnailContainer, thumbnailContainer);

    newThumbnailContainer.addEventListener('click', async (event) => {
        const target = event.target;
        if (target.classList.contains('delete-thumbnail-icon')) {
            const pageNum = parseInt(target.parentElement.dataset.pageNumber, 10);
            if (confirm(`Are you sure you want to delete page ${pageNum}?`)) {
                const pdfDoc = await PDFLib.PDFDocument.load(currentPdfBytes);
                if(pdfDoc.getPageCount() <= 1) return alert("Cannot delete the last page.");
                pdfDoc.removePage(pageNum - 1);
                currentPdfBytes = await pdfDoc.save();
                await renderPdf(currentPdfBytes);
            }
        } else {
            const thumbnailItem = target.closest('.thumbnail-item');
            if (thumbnailItem) {
                const pageNum = parseInt(thumbnailItem.dataset.pageNumber, 10);
                document.querySelector(`.page-container[data-page-number="${pageNum}"]`)?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });

    Sortable.create(newThumbnailContainer, {
        animation: 150,
        onEnd: async (evt) => {
            if (evt.oldIndex === evt.newIndex) return;
            const pdfDoc = await PDFLib.PDFDocument.load(currentPdfBytes);
            const [movedPage] = await pdfDoc.copyPages(pdfDoc, [evt.oldIndex]);
            pdfDoc.removePage(evt.oldIndex);
            pdfDoc.insertPage(evt.newIndex, movedPage);
            currentPdfBytes = await pdfDoc.save();
            await renderPdf(currentPdfBytes);
        }
    });

    const thumbRenderPromises = [];
    for (let i = 0; i < pdf.numPages; i++) {
        const pageNum = i + 1;
        thumbRenderPromises.push(
            pdf.getPage(pageNum).then(page => {
                const thumbnailItem = document.createElement('div');
                thumbnailItem.className = 'thumbnail-item';
                thumbnailItem.dataset.pageNumber = pageNum;
                const canvas = document.createElement('canvas');
                const viewport = page.getViewport({ scale: 0.3 });
                Object.assign(canvas, { width: viewport.width, height: viewport.height });
                const deleteIcon = document.createElement('i');
                deleteIcon.className = 'fas fa-trash-alt delete-thumbnail-icon';
                thumbnailItem.append(canvas, deleteIcon);
                newThumbnailContainer.appendChild(thumbnailItem);
                return page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            })
        );
    }
    await Promise.all(thumbRenderPromises);
}

// --- RENDER ELEMENTS & MANIPULATION ---
function renderTextElements() { document.querySelectorAll('.text-overlay > div[contenteditable="true"]').forEach(el => el.remove()); for (const state of textElementsState) { const overlay = document.querySelector(`.text-overlay[data-page-number="${state.pageNum}"]`); if (!overlay) continue; const textElement = document.createElement('div'); textElement.id = state.id; textElement.contentEditable = true; Object.assign(textElement.style, { position: 'absolute', left: `${state.x}px`, top: `${state.y}px`, fontFamily: state.font, fontSize: `${state.fontSize}px`, color: state.color, border: '1px dashed #ccc', padding: '2px', cursor: 'move' }); textElement.innerText = state.text; overlay.appendChild(textElement); makeDraggableAndSelectable(textElement); } }
function renderShapeElements() { document.querySelectorAll('.shape-container').forEach(el => el.remove()); for (const state of shapeElementsState) { const overlay = document.querySelector(`.text-overlay[data-page-number="${state.pageNum}"]`); if (!overlay) continue; const shapeContainer = document.createElement('div'); shapeContainer.id = state.id; shapeContainer.className = 'shape-container'; Object.assign(shapeContainer.style, { position: 'absolute', left: `${state.x}px`, top: `${state.y}px`, width: `${state.width}px`, height: `${state.height}px`, backgroundColor: state.fill, border: `${state.borderWidth}px solid ${state.border}`, cursor: 'move' }); if (state.type === 'circle') shapeContainer.style.borderRadius = '50%'; overlay.appendChild(shapeContainer); makeDraggableAndResizable(shapeContainer); } }
function renderImageElements() { document.querySelectorAll('.image-container').forEach(el => el.remove()); for (const state of imageElementsState) { const overlay = document.querySelector(`.text-overlay[data-page-number="${state.pageNum}"]`); if (!overlay) continue; const imageContainer = document.createElement('div'); imageContainer.id = state.id; imageContainer.className = 'image-container'; Object.assign(imageContainer.style, { position: 'absolute', left: `${state.x}px`, top: `${state.y}px`, width: `${state.width}px`, height: state.height, border: '1px dashed #ccc', cursor: 'move' }); const img = document.createElement('img'); img.src = state.src; Object.assign(img.style, { width: '100%', height: '100%' }); imageContainer.appendChild(img); overlay.appendChild(imageContainer); makeDraggableAndResizable(imageContainer); } }
function makeDraggableAndSelectable(element) { element.addEventListener('mousedown', (e) => { e.stopPropagation(); if (selectedElement) selectedElement.classList.remove('selected'); selectedElement = element; selectedElement.classList.add('selected'); if (element.contentEditable) updateToolbarWithSelectedTextStyle(); offsetX = e.clientX - element.getBoundingClientRect().left; offsetY = e.clientY - element.getBoundingClientRect().top; document.body.classList.add('dragging'); }); document.addEventListener('mousemove', (e) => { if (!selectedElement || !document.body.classList.contains('dragging') || selectedElement !== element) return; const x = e.clientX - offsetX; const y = e.clientY - offsetY; element.style.left = `${x}px`; element.style.top = `${y}px`; const state = textElementsState.find(s => s.id === element.id); if (state) { state.x = x; state.y = y; } }); document.addEventListener('mouseup', () => document.body.classList.remove('dragging')); }
function makeDraggableAndResizable(element) { interact(element) .draggable({ listeners: { move(event) { const target = event.target; const state = imageElementsState.find(s => s.id === target.id) || shapeElementsState.find(s => s.id === target.id); if(!state) return; state.x += event.dx; state.y += event.dy; target.style.left = `${state.x}px`; target.style.top = `${state.y}px`; } }, inertia: true, modifiers: [ interact.modifiers.restrictRect({ restriction: 'parent' }) ] }) .resizable({ edges: { left: true, right: true, bottom: true, top: true }, listeners: { move(event) { const target = event.target; const state = imageElementsState.find(s => s.id === target.id) || shapeElementsState.find(s => s.id === target.id); if(!state) return; state.width = event.rect.width; state.height = event.rect.height; target.style.width = `${state.width}px`; target.style.height = `${state.height}px`; } }, inertia: true }); }

// --- UI UPDATES ---
function updateContextToolbar() { const controls = { text: document.getElementById('text-controls'), image: document.getElementById('image-controls'), draw: document.getElementById('draw-controls'), rect: document.getElementById('shape-controls'), circle: document.getElementById('shape-controls'), }; const contextToolbar = document.getElementById('context-toolbar'); Object.values(controls).forEach(c => c.classList.add('hidden')); if (activeTool && controls[activeTool]) { contextToolbar.classList.remove('hidden'); controls[activeTool].classList.remove('hidden'); } else { contextToolbar.classList.add('hidden'); } }
document.getElementById('delete-text-btn').addEventListener('click', () => { if (selectedElement) { textElementsState = textElementsState.filter(s => s.id !== selectedElement.id); selectedElement.remove(); selectedElement = null; } });
function updateToolbarWithSelectedTextStyle() { if (!selectedElement) return; const state = textElementsState.find(s => s.id === selectedElement.id); if(!state) return; document.getElementById('font-select').value = state.font; document.getElementById('font-size-input').value = state.fontSize; document.getElementById('font-color-input').value = state.color; }
document.getElementById('font-select').addEventListener('change', (e) => { if (selectedElement) { selectedElement.style.fontFamily = e.target.value; const state = textElementsState.find(s => s.id === selectedElement.id); state.font = e.target.value; } });
document.getElementById('font-size-input').addEventListener('input', (e) => { if (selectedElement) { selectedElement.style.fontSize = `${e.target.value}px`; const state = textElementsState.find(s => s.id === selectedElement.id); state.fontSize = parseInt(e.target.value, 10); } });
document.getElementById('font-color-input').addEventListener('input', (e) => { if (selectedElement) { selectedElement.style.color = e.target.value; const state = textElementsState.find(s => s.id === selectedElement.id); state.color = e.target.value; } });

// --- DOWNLOAD ---
document.getElementById('download-btn').addEventListener('click', async () => { if (!currentPdfBytes) return alert("Please load a PDF first."); try { const pdfDoc = await PDFLib.PDFDocument.load(currentPdfBytes); const { StandardFonts, rgb } = PDFLib; for(const state of textElementsState) { const page = pdfDoc.getPage(state.pageNum-1); if(!page) continue; const font = await pdfDoc.embedFont(StandardFonts[state.font] || StandardFonts.Helvetica); const color = {r: parseInt(state.color.slice(1,3),16)/255, g: parseInt(state.color.slice(3,5),16)/255, b: parseInt(state.color.slice(5,7),16)/255}; page.drawText(state.text, {x: state.x, y: page.getHeight() - state.y - state.fontSize, font, size: state.fontSize, color: rgb(color.r, color.g, color.b) }); } for(const state of imageElementsState) { const page = pdfDoc.getPage(state.pageNum-1); if(!page) continue; const imgBytes = await fetch(state.src).then(res => res.arrayBuffer()); const image = await pdfDoc.embedPng(imgBytes); page.drawImage(image, {x: state.x, y: page.getHeight() - state.y - state.height, width: state.width, height: state.height}); } for(const state of shapeElementsState) { const page = pdfDoc.getPage(state.pageNum-1); if(!page) continue; const color = {r: parseInt(state.fill.slice(1,3),16)/255, g: parseInt(state.fill.slice(3,5),16)/255, b: parseInt(state.fill.slice(5,7),16)/255}; const borderColor = {r: parseInt(state.border.slice(1,3),16)/255, g: parseInt(state.border.slice(3,5),16)/255, b: parseInt(state.border.slice(5,7),16)/255}; if(state.type === 'rect') { page.drawRectangle({x: state.x, y: page.getHeight() - state.y - state.height, width: state.width, height: state.height, color: rgb(color.r, color.g, color.b), borderColor: rgb(borderColor.r, borderColor.g, borderColor.b), borderWidth: state.borderWidth}); } else if(state.type === 'circle') { page.drawCircle({x: state.x + state.width/2, y: page.getHeight() - state.y - state.height/2, size: Math.min(state.width, state.height)/2, color: rgb(color.r, color.g, color.b), borderColor: rgb(borderColor.r, borderColor.g, borderColor.b), borderWidth: state.borderWidth}); } } const drawingCanvases = document.querySelectorAll('.drawing-canvas'); for (const canvas of drawingCanvases) { const pageNum = parseInt(canvas.dataset.pageNumber, 10); if (canvas.getContext('2d').getImageData(0,0,1,1).data.some(channel => channel !== 0)) { const pngBytes = await new Promise(res => canvas.toBlob(blob => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.readAsArrayBuffer(blob); }, 'image/png')); const png = await pdfDoc.embedPng(pngBytes); const page = pdfDoc.getPage(pageNum - 1); page.drawImage(png, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() }); } } const pdfBytes = await pdfDoc.save(); const blob = new Blob([pdfBytes], {type: 'application/pdf'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'edited.pdf'; link.click(); URL.revokeObjectURL(link.href); } catch (error) { console.error("Error saving PDF:", error); alert("Failed to save PDF. An unexpected error occurred."); } });
