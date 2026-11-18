import { jpegBlob, makeCanvas, paintImage } from './canvas';
import { loadVendorScript, vendorRoot } from './vendor';

type PageSize = { width: number; height: number };
type Viewport = PageSize;
type PdfPage = {
  getViewport(options: { scale: number }): Viewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: Viewport;
  }): {
    promise: Promise<void>;
    cancel(): void;
  };
};
type PdfReader = {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
};
type EmbeddedImage = {
  scaleToFit(width: number, height: number): PageSize;
};
type PdfWriter = {
  embedJpg(bytes: ArrayBuffer): Promise<EmbeddedImage>;
  addPage(size: [number, number]): {
    drawImage(
      image: EmbeddedImage,
      options: PageSize & { x: number; y: number },
    ): void;
  };
  save(): Promise<Uint8Array<ArrayBuffer>>;
};

declare global {
  interface Window {
    PDFLib: { PDFDocument: { create(): Promise<PdfWriter> } };
    pdfjsLib: {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument(options: { data: ArrayBuffer; isEvalSupported: boolean }): {
        promise: Promise<PdfReader>;
        destroy(): Promise<void>;
      };
    };
  }
}

async function fitPages(
  pages: { canvas: HTMLCanvasElement; size?: PageSize }[],
  limit: number,
  signal: AbortSignal,
) {
  async function encode(quality: number) {
    const doc = await window.PDFLib.PDFDocument.create();
    let preview: Blob | undefined;
    for (const { canvas, size } of pages) {
      signal.throwIfAborted();
      const jpeg = await jpegBlob(canvas, quality);
      preview ??= jpeg;
      const image = await doc.embedJpg(await jpeg.arrayBuffer());
      const { width, height } = size ?? { width: 595.28, height: 841.89 };
      const dimensions = size ?? image.scaleToFit(width - 40, height - 40);
      doc.addPage([width, height]).drawImage(image, {
        ...dimensions,
        x: (width - dimensions.width) / 2,
        y: (height - dimensions.height) / 2,
      });
    }
    return {
      blob: new Blob([await doc.save()], { type: 'application/pdf' }),
      preview,
      pageCount: pages.length,
    };
  }

  let high = 0.9;
  let low = 0.1;
  const full = await encode(high);
  if (full.blob.size <= limit) return full;
  let best = await encode(low);
  if (best.blob.size > limit) return best;
  for (let step = 0; step < 5; step++) {
    const quality = (low + high) / 2;
    const candidate = await encode(quality);
    if (candidate.blob.size > limit) high = quality;
    else {
      best = candidate;
      low = quality;
    }
  }
  return best;
}

export async function fitPdf(
  source: File | ImageBitmap[],
  limit: number,
  signal: AbortSignal,
) {
  const pdf = source instanceof File ? source : null;
  await Promise.all([
    loadVendorScript('pdf-lib.min.js'),
    pdf && loadVendorScript('pdfjs/pdf.min.js'),
  ]);
  signal.throwIfAborted();

  if (Array.isArray(source)) {
    const maxSide = Math.min(
      1600,
      Math.floor(Math.sqrt(20_000_000 / source.length)),
    );
    const pages = source.map((bitmap) => {
      const scale = Math.min(
        1,
        maxSide / Math.max(bitmap.width, bitmap.height),
      );
      return paintImage(
        bitmap,
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
      );
    });
    try {
      return await fitPages(pages, limit, signal);
    } finally {
      for (const { canvas } of pages) canvas.width = 0;
    }
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${vendorRoot}/pdfjs/pdf.worker.min.js`;
  const data = await source.arrayBuffer();
  signal.throwIfAborted();
  // The reference PDF.js release requires disabling its font-evaluation path for untrusted PDFs.
  const task = window.pdfjsLib.getDocument({ data, isEvalSupported: false });
  try {
    const doc = await task.promise;
    let smallest: Awaited<ReturnType<typeof fitPages>> | undefined;
    for (let scale = 1.5; scale >= 0.5; scale -= 0.25) {
      const pages: { canvas: HTMLCanvasElement; size: PageSize }[] = [];
      try {
        for (let index = 1; index <= doc.numPages; index++) {
          signal.throwIfAborted();
          const page = await doc.getPage(index);
          const size = page.getViewport({ scale: 1 });
          const rasterScale = Math.min(
            scale,
            4096 / Math.max(size.width, size.height),
            Math.sqrt(20_000_000 / doc.numPages / size.width / size.height),
          );
          const viewport = page.getViewport({ scale: rasterScale });
          const { canvas, context } = makeCanvas(
            Math.max(1, Math.ceil(viewport.width)),
            Math.max(1, Math.ceil(viewport.height)),
          );
          pages.push({ canvas, size });
          const render = page.render({ canvasContext: context, viewport });
          const cancel = () => render.cancel();
          signal.addEventListener('abort', cancel, { once: true });
          try {
            await render.promise;
          } finally {
            signal.removeEventListener('abort', cancel);
          }
        }
        const candidate = await fitPages(pages, limit, signal);
        if (candidate.blob.size <= limit) return candidate;
        if (!smallest || candidate.blob.size < smallest.blob.size)
          smallest = candidate;
      } finally {
        for (const { canvas } of pages) canvas.width = 0;
      }
    }
    if (smallest) return smallest;
    throw new Error('Could not prepare the PDF.');
  } finally {
    await task.destroy();
  }
}
