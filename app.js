// Set the workerSrc to the path of the PDF.js worker script.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js';

let currentPdfBytes = null; // This will hold the bytes of the currently loaded PDF

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

function renderPdf(pdfBytes) {
    const loadingTask = pdfjsLib.getDocument(pdfBytes);
    loadingTask.promise.then(pdf => {
        const viewer = document.getElementById('pdf-viewer');
        viewer.innerHTML = ''; // Clear previous content
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            pdf.getPage(pageNum).then(page => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                const viewport = page.getViewport({ scale: 1.5 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                page.render(renderContext);
                viewer.appendChild(canvas);
            });
        }
    });
}
