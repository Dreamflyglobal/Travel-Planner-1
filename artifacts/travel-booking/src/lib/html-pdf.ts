import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Converts any URL to an absolute URL so html2canvas can fetch it.
 */
function toAbsoluteUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) return url;
  return window.location.origin + (url.startsWith("/") ? url : `/${url}`);
}

/**
 * Preloads all <img> tags inside element and waits for document fonts.
 * This ensures html2canvas captures logos and images instead of broken icons.
 */
async function preloadAllImages(element: HTMLElement): Promise<void> {
  const imgs = Array.from(element.querySelectorAll<HTMLImageElement>("img"));

  await Promise.all(
    imgs.map((img) => {
      // Fix relative src → absolute so html2canvas can fetch it
      if (img.src && !img.src.startsWith("data:") && !img.src.startsWith("http")) {
        img.src = toAbsoluteUrl(img.src);
      }
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener("load",  () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true }); // don't block on failure
      });
    }),
  );

  // Wait for web fonts (Inter, etc.) to be available before capturing text
  await document.fonts.ready;
}

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
  // Ensure logo + all images are fully loaded before capture
  await preloadAllImages(element);

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

  // Force a file download (never open in browser tab)
  const pdfBytes = pdf.output("arraybuffer");
  const blob     = new Blob([pdfBytes], { type: "application/pdf" });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement("a");
  a.href         = url;
  a.download     = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
