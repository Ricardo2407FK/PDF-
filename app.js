// Set the workerSrc to the path of the PDF.js worker script.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js';

let currentPdfBytes = null; // This will hold the bytes of the currently loaded PDF
let textAddMode = false;
let drawMode = false;
let shapeMode = null; // Can be 'rect', 'circle', etc.
let fontCache = {};
let selectedElement = null;
let offsetX, offsetY;
let textElementsState = [];
let imageElementsState = [];
let shapeElementsState = [];

document.getElementById('upload-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

document.getElementById('welcome-upload-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

const welcomeScreen = document.getElementById('welcome-screen');

welcomeScreen.addEventListener('dragover', (event) => {
    event.preventDefault();
    welcomeScreen.style.backgroundColor = '#e0e0e0';
});

welcomeScreen.addEventListener('dragleave', (event) => {
    event.preventDefault();
    welcomeScreen.style.backgroundColor = 'var(--secondary-bg)';
});

welcomeScreen.addEventListener('drop', (event) => {
    event.preventDefault();
    welcomeScreen.style.backgroundColor = 'var(--secondary-bg)';
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        const fileReader = new FileReader();
        fileReader.onload = function() {
            currentPdfBytes = new Uint8Array(this.result);
            renderPdf(currentPdfBytes);
        };
        fileReader.readAsArrayBuffer(file);
    } else {
        alert('Please drop a valid PDF file.');
    }
});

document.getElementById('file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        const fileReader = new FileReader();
        fileReader.onload = function() {
            currentPdfBytes = new Uint8Array(this.result);
            renderPdf(currentPdfBytes);
        };
        fileReader.readAsArrayBuffer(file);
    } else {
        alert('Please select a valid PDF file.');
    }
});

document.getElementById('add-page-btn').addEventListener('click', async () => {
    if (!currentPdfBytes) {
        alert("Please load a PDF first.");
        return;
    }

    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(currentPdfBytes);
    pdfDoc.addPage(); // Adds a blank A4 page by default

    currentPdfBytes = await pdfDoc.save();
    textElementsState = []; // Clear the state after saving
    renderPdf(currentPdfBytes);
});

document.getElementById('download-btn').addEventListener('click', () => {
    if (!currentPdfBytes) {
        alert("Please load a PDF first.");
        return;
    }

    const blob = new Blob([currentPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

document.getElementById('add-text-btn').addEventListener('click', () => {
    textAddMode = !textAddMode;
    updateContextToolbar();
});

document.getElementById('add-image-btn').addEventListener('click', () => {
    document.getElementById('image-input').click();
});

document.getElementById('draw-btn').addEventListener('click', () => {
    drawMode = !drawMode;
    shapeMode = null;
    updateContextToolbar();

    const drawingCanvases = document.querySelectorAll('.drawing-canvas');
    drawingCanvases.forEach(canvas => {
        canvas.style.display = drawMode ? 'block' : 'none';
        if (drawMode) {
            setupDrawingCanvas(canvas);
        }
    });
});

document.getElementById('add-rect-btn').addEventListener('click', () => {
    shapeMode = 'rect';
    drawMode = false;
    textAddMode = false;
    updateContextToolbar();
});

document.getElementById('add-circle-btn').addEventListener('click', () => {
    shapeMode = 'circle';
    drawMode = false;
    textAddMode = false;
    updateContextToolbar();
});

let drawing = false;
let lastX, lastY;

function setupDrawingCanvas(canvas) {
    const ctx = canvas.getContext('2d');

    canvas.addEventListener('mousedown', (e) => {
        drawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!drawing) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.strokeStyle = document.getElementById('draw-color-input').value;
        ctx.lineWidth = document.getElementById('draw-thickness-input').value;
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });

    canvas.addEventListener('mouseup', () => drawing = false);
    canvas.addEventListener('mouseout', () => drawing = false);
}

document.getElementById('image-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            updateContextToolbar('image');
            const id = `image-${Date.now()}`;
            const image = {
                id,
                src: e.target.result,
                x: 0,
                y: 0,
                width: 200, // Default width
                height: 'auto',
                pageNum: 1 // Default to first page
            };
            imageElementsState.push(image);
            renderImageElements();
        }
        reader.readAsDataURL(file);
    } else {
        alert('Please select a valid JPG or PNG image.');
    }
});

document.getElementById('pdf-viewer').addEventListener('click', async (event) => {
    if (shapeMode) {
        const targetOverlay = event.target.closest('.text-overlay');
        if (!targetOverlay) return;

        const rect = targetOverlay.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const pageNum = parseInt(targetOverlay.dataset.pageNumber, 10);

        const id = `shape-${Date.now()}`;
        const shape = {
            id,
            type: shapeMode,
            x,
            y,
            width: 100,
            height: 100,
            fill: document.getElementById('shape-fill-color-input').value,
            border: document.getElementById('shape-border-color-input').value,
            borderWidth: parseInt(document.getElementById('shape-border-thickness-input').value, 10),
            pageNum
        };
        shapeElementsState.push(shape);
        renderShapeElements();
        shapeMode = null;
        updateContextToolbar();
    } else if (event.target.classList.contains('delete-page-btn')) {
        const pageNum = parseInt(event.target.dataset.pageNumber, 10);
        if (confirm(`Are you sure you want to delete page ${pageNum}?`)) {
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.load(currentPdfBytes);
            pdfDoc.removePage(pageNum - 1);
            currentPdfBytes = await pdfDoc.save();
            renderPdf(currentPdfBytes);
        }
    } else if (textAddMode) {
        event.stopPropagation();
        const targetOverlay = event.target.closest('.text-overlay');
        if (!targetOverlay) return;

        const rect = targetOverlay.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const pageNum = parseInt(targetOverlay.dataset.pageNumber, 10);

        const text = document.getElementById('text-input').value;
        const font = document.getElementById('font-select').value;
        const fontSize = parseInt(document.getElementById('font-size-input').value, 10);
        const color = document.getElementById('font-color-input').value;

        const id = `text-${Date.now()}`;

        textElementsState.push({ id, text, x, y, font, fontSize, color, pageNum });
        renderTextElements();

    } else {
        if (event.target.contentEditable) {
            if (selectedElement) {
                selectedElement.classList.remove('selected');
            }
            selectedElement = event.target;
            selectedElement.classList.add('selected');
            updateToolbarWithSelectedTextStyle();
        }
    }
});

function makeDraggableAndSelectable(element) {
    element.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (textAddMode) return;
        if (selectedElement) {
            selectedElement.classList.remove('selected');
        }
        selectedElement = element;
        selectedElement.classList.add('selected');
        updateToolbarWithSelectedTextStyle();

        offsetX = e.clientX - element.getBoundingClientRect().left;
        offsetY = e.clientY - element.getBoundingClientRect().top;
        document.body.classList.add('dragging');
    });
}

document.addEventListener('mousemove', (e) => {
    if (!selectedElement || !document.body.classList.contains('dragging')) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    selectedElement.style.left = `${x}px`;
    selectedElement.style.top = `${y}px`;

    const state = textElementsState.find(s => s.id === selectedElement.id);
    state.x = x;
    state.y = y;
});

document.addEventListener('mouseup', () => {
    document.body.classList.remove('dragging');
});

document.getElementById('delete-text-btn').addEventListener('click', () => {
    if (selectedElement) {
        textElementsState = textElementsState.filter(s => s.id !== selectedElement.id);
        selectedElement.remove();
        selectedElement = null;
    }
});

document.getElementById('font-select').addEventListener('change', (e) => {
    if (selectedElement) {
        selectedElement.style.fontFamily = e.target.value;
        const state = textElementsState.find(s => s.id === selectedElement.id);
        state.font = e.target.value;
    }
});

document.getElementById('font-size-input').addEventListener('input', (e) => {
    if (selectedElement) {
        selectedElement.style.fontSize = `${e.target.value}px`;
        const state = textElementsState.find(s => s.id === selectedElement.id);
        state.fontSize = parseInt(e.target.value, 10);
    }
});

document.getElementById('font-color-input').addEventListener('input', (e) => {
    if (selectedElement) {
        selectedElement.style.color = e.target.value;
        const state = textElementsState.find(s => s.id === selectedElement.id);
        state.color = e.target.value;
    }
});

function updateToolbarWithSelectedTextStyle() {
    if (!selectedElement) return;
    const state = textElementsState.find(s => s.id === selectedElement.id);
    document.getElementById('font-select').value = state.font;
    document.getElementById('font-size-input').value = state.fontSize;
    document.getElementById('font-color-input').value = state.color;
}

document.getElementById('apply-changes-btn').addEventListener('click', async () => {
    if (!currentPdfBytes) {
        alert("Please load a PDF first.");
        return;
    }

    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.load(currentPdfBytes);

    // Embed text
    for (const textItem of textElementsState) {
        if (!fontCache[textItem.font]) {
            fontCache[textItem.font] = await pdfDoc.embedFont(StandardFonts[textItem.font]);
        }
        const page = pdfDoc.getPage(textItem.pageNum - 1);
        const font = fontCache[textItem.font];

        const r = parseInt(textItem.color.slice(1, 3), 16) / 255;
        const g = parseInt(textItem.color.slice(3, 5), 16) / 255;
        const b = parseInt(textItem.color.slice(5, 7), 16) / 255;

        page.drawText(textItem.text, {
            x: textItem.x,
            y: page.getHeight() - textItem.y - textItem.fontSize,
            font: font,
            size: textItem.fontSize,
            color: rgb(r, g, b),
        });
    }

    // Embed images
    for (const imageState of imageElementsState) {
        const page = pdfDoc.getPage(imageState.pageNum - 1);
        const imageBytes = await fetch(imageState.src).then(res => res.arrayBuffer());
        const image = await pdfDoc.embedPng(imageBytes);

        page.drawImage(image, {
            x: imageState.x,
            y: page.getHeight() - imageState.y - imageState.height,
            width: imageState.width,
            height: imageState.height,
        });
    }

    // Embed drawings
    const drawingCanvases = document.querySelectorAll('.drawing-canvas');
    for (const canvas of drawingCanvases) {
        const pageNum = parseInt(canvas.dataset.pageNumber, 10);
        const page = pdfDoc.getPage(pageNum - 1);

        const pngImageBytes = await new Promise(resolve => canvas.toBlob(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(new Uint8Array(reader.result));
            reader.readAsArrayBuffer(blob);
        }, 'image/png'));

        if (pngImageBytes.length > 0) {
            const pngImage = await pdfDoc.embedPng(pngImageBytes);
            page.drawImage(pngImage, {
                x: 0,
                y: 0,
                width: page.getWidth(),
                height: page.getHeight(),
            });
        }
    }

    // Embed shapes
    for (const shape of shapeElementsState) {
        const page = pdfDoc.getPage(shape.pageNum - 1);
        const { width, height } = page.getSize();
        const r = parseInt(shape.fill.slice(1, 3), 16) / 255;
        const g = parseInt(shape.fill.slice(3, 5), 16) / 255;
        const b = parseInt(shape.fill.slice(5, 7), 16) / 255;
        const br = parseInt(shape.border.slice(1, 3), 16) / 255;
        const bg = parseInt(shape.border.slice(3, 5), 16) / 255;
        const bb = parseInt(shape.border.slice(5, 7), 16) / 255;

        if (shape.type === 'rect') {
            page.drawRectangle({
                x: shape.x,
                y: height - shape.y - shape.height,
                width: shape.width,
                height: shape.height,
                color: rgb(r, g, b),
                borderColor: rgb(br, bg, bb),
                borderWidth: shape.borderWidth,
            });
        } else if (shape.type === 'circle') {
            page.drawCircle({
                x: shape.x + shape.width / 2,
                y: height - shape.y - shape.height / 2,
                size: Math.min(shape.width, shape.height) / 2,
                color: rgb(r, g, b),
                borderColor: rgb(br, bg, bb),
                borderWidth: shape.borderWidth,
            });
        }
    }

    currentPdfBytes = await pdfDoc.save();

    // Clear all states
    textElementsState = [];
    imageElementsState = [];
    shapeElementsState = [];
    textAddMode = false;
    drawMode = false;
    shapeMode = null;

    updateContextToolbar();
    renderPdf(currentPdfBytes);
});

function updateContextToolbar(activeTool = null) {
    const contextToolbar = document.getElementById('context-toolbar');
    const textControls = document.getElementById('text-controls');
    const imageControls = document.getElementById('image-controls');
    const drawControls = document.getElementById('draw-controls');
    const shapeControls = document.getElementById('shape-controls');

    // Hide all controls by default
    textControls.classList.add('hidden');
    imageControls.classList.add('hidden');
    drawControls.classList.add('hidden');
    shapeControls.classList.add('hidden');
    contextToolbar.classList.add('hidden');

    if (textAddMode) {
        textControls.classList.remove('hidden');
        contextToolbar.classList.remove('hidden');
    } else if (activeTool === 'image') {
        imageControls.classList.remove('hidden');
        contextToolbar.classList.remove('hidden');
    } else if (drawMode) {
        drawControls.classList.remove('hidden');
        contextToolbar.classList.remove('hidden');
    } else if (shapeMode) {
        shapeControls.classList.remove('hidden');
        contextToolbar.classList.remove('hidden');
    }
}

function renderImageElements() {
    const overlays = document.querySelectorAll('.text-overlay');
    overlays.forEach(overlay => {
        // Clear only image elements
        overlay.querySelectorAll('.image-container').forEach(el => el.remove());
    });

    for (const state of imageElementsState) {
        const overlay = document.querySelector(`.text-overlay[data-page-number="${state.pageNum}"]`);
        const imageContainer = document.createElement('div');
        imageContainer.id = state.id;
        imageContainer.className = 'image-container';
        imageContainer.style.position = 'absolute';
        imageContainer.style.left = `${state.x}px`;
        imageContainer.style.top = `${state.y}px`;
        imageContainer.style.width = `${state.width}px`;
        imageContainer.style.height = `${state.height}`;

        const img = document.createElement('img');
        img.src = state.src;
        img.style.width = '100%';
        img.style.height = '100%';

        imageContainer.appendChild(img);
        overlay.appendChild(imageContainer);
        makeDraggableAndResizable(imageContainer);
    }
}

function makeDraggableAndResizable(element) {
    interact(element)
        .draggable({
            listeners: {
                move(event) {
                    const target = event.target;
                    let state;
                    if (target.classList.contains('image-container')) {
                        state = imageElementsState.find(s => s.id === target.id);
                    } else if (target.classList.contains('shape-container')) {
                        state = shapeElementsState.find(s => s.id === target.id);
                    }
                    state.x += event.dx;
                    state.y += event.dy;
                    target.style.left = `${state.x}px`;
                    target.style.top = `${state.y}px`;
                }
            },
            inertia: true,
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: 'parent',
                    endOnly: true
                })
            ]
        })
        .resizable({
            edges: { left: true, right: true, bottom: true, top: true },
            listeners: {
                move(event) {
                    const target = event.target;
                    let state;
                    if (target.classList.contains('image-container')) {
                        state = imageElementsState.find(s => s.id === target.id);
                    } else if (target.classList.contains('shape-container')) {
                        state = shapeElementsState.find(s => s.id === target.id);
                    }
                    state.width = event.rect.width;
                    state.height = event.rect.height;
                    target.style.width = `${state.width}px`;
                    target.style.height = `${state.height}px`;
                }
            },
            inertia: true
        });
}

function renderShapeElements() {
    const overlays = document.querySelectorAll('.text-overlay');
    overlays.forEach(overlay => {
        // Clear only shape elements
        overlay.querySelectorAll('.shape-container').forEach(el => el.remove());
    });

    for (const state of shapeElementsState) {
        const overlay = document.querySelector(`.text-overlay[data-page-number="${state.pageNum}"]`);
        const shapeContainer = document.createElement('div');
        shapeContainer.id = state.id;
        shapeContainer.className = 'shape-container';
        shapeContainer.style.position = 'absolute';
        shapeContainer.style.left = `${state.x}px`;
        shapeContainer.style.top = `${state.y}px`;
        shapeContainer.style.width = `${state.width}px`;
        shapeContainer.style.height = `${state.height}px`;
        shapeContainer.style.backgroundColor = state.fill;
        shapeContainer.style.border = `${state.borderWidth}px solid ${state.border}`;

        if (state.type === 'circle') {
            shapeContainer.style.borderRadius = '50%';
        }

        overlay.appendChild(shapeContainer);
        makeDraggableAndResizable(shapeContainer);
    }
}

function renderTextElements() {
    const overlays = document.querySelectorAll('.text-overlay');
    overlays.forEach(overlay => {
        // Clear only text elements
        overlay.querySelectorAll('div[contenteditable="true"]').forEach(el => el.remove());
    });

    for (const state of textElementsState) {
        const overlay = document.querySelector(`.text-overlay[data-page-number="${state.pageNum}"]`);
        const textElement = document.createElement('div');
        textElement.id = state.id;
        textElement.contentEditable = true;
        textElement.style.position = 'absolute';
        textElement.style.left = `${state.x}px`;
        textElement.style.top = `${state.y}px`;
        textElement.style.fontFamily = state.font;
        textElement.style.fontSize = `${state.fontSize}px`;
        textElement.style.color = state.color;
        textElement.innerText = state.text;

        overlay.appendChild(textElement);
        makeDraggableAndSelectable(textElement);
    }
}


function renderPdf(pdfBytes) {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('content-area').classList.remove('hidden');

    const loadingTask = pdfjsLib.getDocument(pdfBytes);
    loadingTask.promise.then(pdf => {
        const viewer = document.getElementById('pdf-viewer');
        viewer.innerHTML = ''; // Clear previous content
        fontCache = {}; // Clear the font cache when a new PDF is rendered
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            pdf.getPage(pageNum).then(page => {
                const pageContainer = document.createElement('div');
                pageContainer.className = 'page-container';

                const canvas = document.createElement('canvas');
                canvas.setAttribute('data-page-number', pageNum);
                const context = canvas.getContext('2d');
                const viewport = page.getViewport({ scale: 1.5 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                page.render(renderContext).promise.then(() => {
                    const textOverlay = document.createElement('div');
                    textOverlay.className = 'text-overlay';
                    textOverlay.setAttribute('data-page-number', pageNum);
                    textOverlay.style.height = `${viewport.height}px`;
                    textOverlay.style.width = `${viewport.width}px`;

                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'delete-page-btn';
                    deleteButton.textContent = 'Delete';
                    deleteButton.setAttribute('data-page-number', pageNum);

                    const drawingCanvas = document.createElement('canvas');
                    drawingCanvas.className = 'drawing-canvas';
                    drawingCanvas.setAttribute('data-page-number', pageNum);
                    drawingCanvas.width = viewport.width;
                    drawingCanvas.height = viewport.height;
                    drawingCanvas.style.display = 'none';

                    pageContainer.appendChild(canvas);
                    pageContainer.appendChild(textOverlay);
                    pageContainer.appendChild(drawingCanvas);
                    pageContainer.appendChild(deleteButton);
                    viewer.appendChild(pageContainer);

                    renderTextElements();
                    renderImageElements();
                    renderShapeElements();
                });
            });
        }
    });
}
