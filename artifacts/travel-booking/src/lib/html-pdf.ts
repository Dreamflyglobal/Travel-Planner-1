import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Captures a DOM element and saves it as a multi-page A4 PDF.
 * Uses html2canvas at 2× scale for crisp output.
 *
 * @param element  The DOM element to capture (should be white-background).
 * @param filename Suggested filename for the download.
 */
export async function captureElementAsPDF(
  element: HTMLElement,
  filename = "invoice.pdf",
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    removeContainer: true,
  });

  const imgData  = canvas.toDataURL("image/png");
  const pdf      = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const pdfW     = 210;           // A4 width  (mm)
  const pdfH     = 297;           // A4 height (mm)
  const imgPxW   = canvas.width;
  const imgPxH   = canvas.height;
  const mmPerPx  = pdfW / imgPxW; // mm per canvas pixel
  const imgMmH   = imgPxH * mmPerPx;

  if (imgMmH <= pdfH) {
    // Single page
    pdf.addImage(imgData, "PNG", 0, 0, pdfW, imgMmH);
  } else {
    // Slice canvas into A4 pages
    const pageHeightPx = Math.floor(pdfH / mmPerPx);
    let yOffset = 0;

    while (yOffset < imgPxH) {
      if (yOffset > 0) pdf.addPage();

      const sliceH      = Math.min(pageHeightPx, imgPxH - yOffset);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width  = imgPxW;
      sliceCanvas.height = pageHeightPx;

      const ctx = sliceCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, imgPxW, pageHeightPx);
        ctx.drawImage(canvas, 0, yOffset, imgPxW, sliceH, 0, 0, imgPxW, sliceH);
      }

      pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, 0, pdfW, pdfH);
      yOffset += pageHeightPx;
    }
  }

  pdf.save(filename);
}
