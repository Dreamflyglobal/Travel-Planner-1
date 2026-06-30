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
 * Races against an 8 s timeout so a stuck network request never hangs the PDF.
 */
async function preloadAllImages(element: HTMLElement): Promise<void> {
  const imgs = Array.from(element.querySelectorAll<HTMLImageElement>("img"));

  const loadOne = (img: HTMLImageElement): Promise<void> => {
    if (img.src && !img.src.startsWith("data:") && !img.src.startsWith("http")) {
      img.src = toAbsoluteUrl(img.src);
    }
    if (img.complete && img.naturalHeight > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.addEventListener("load",  () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  };

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 8000));
  await Promise.race([Promise.all(imgs.map(loadOne)), timeout]);

  try { await document.fonts.ready; } catch { /* noop */ }
}

/**
 * Triggers a file download for a Blob in any browsing context, including
 * sandboxed iframes (Replit preview pane). Falls back to window.open when the
 * anchor-click approach is blocked.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // If anchor-click is blocked (sandboxed iframe) open in new tab so the
    // user can save the file from the browser's native PDF viewer.
    window.open(url, "_blank", "noopener");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/**
 * Captures a DOM element and saves it as a multi-page A4 PDF.
 * Uses html2canvas at 2× scale for crisp output.
 */
export async function captureElementAsPDF(
  element: HTMLElement,
  filename = "invoice.pdf",
): Promise<void> {
  await preloadAllImages(element);

  // NOTE: Do NOT use allowTaint:true together with useCORS:true — it taints
  // the canvas and makes toDataURL() throw a SecurityError.
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    removeContainer: true,
    windowWidth: element.scrollWidth,
  });

  let imgData: string;
  try {
    imgData = canvas.toDataURL("image/png");
  } catch (e) {
    // Canvas was tainted by a cross-origin image — retry without CORS so
    // html2canvas skips those images rather than blocking the whole capture.
    console.warn("[html-pdf] Canvas tainted, retrying with allowTaint:", e);
    const canvas2 = await html2canvas(element, {
      scale: 2,
      useCORS: false,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      removeContainer: true,
      windowWidth: element.scrollWidth,
    });
    imgData = canvas2.toDataURL("image/png");
  }

  const pdf    = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pdfW   = 210;
  const pdfH   = 297;
  const imgPxW = canvas.width;
  const imgPxH = canvas.height;
  const mmPerPx = pdfW / imgPxW;
  const imgMmH  = imgPxH * mmPerPx;

  if (imgMmH <= pdfH) {
    pdf.addImage(imgData, "PNG", 0, 0, pdfW, imgMmH);
  } else {
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

  const blob = new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
  downloadBlob(blob, filename);
}
