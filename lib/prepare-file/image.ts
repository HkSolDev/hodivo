import { jpegBlob, paintImage } from './canvas';
import type { readRequirements } from './requirements';

export async function fitImage(
  bitmap: ImageBitmap,
  maximumKB: number,
  signal: AbortSignal,
  requirements?: ReturnType<typeof readRequirements>,
) {
  const limit = maximumKB * 1000;
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const fixed = Boolean(requirements?.width);
  let width =
    requirements?.width || Math.max(1, Math.round(bitmap.width * scale));
  let height =
    requirements?.height || Math.max(1, Math.round(bitmap.height * scale));
  const mozEncode =
    maximumKB <= 30
      ? await import('./mozjpeg')
          .then((module) => module.loadMozJpeg())
          .catch(() => null)
      : null;

  let smallest: { blob: Blob; width: number; height: number } | undefined;
  for (let attempt = 0; attempt < (fixed ? 1 : 5); attempt++) {
    signal.throwIfAborted();
    const { canvas, context } = paintImage(bitmap, width, height);
    try {
      const pixels = mozEncode
        ? context.getImageData(0, 0, width, height)
        : null;
      const encode = async (quality: number) => {
        signal.throwIfAborted();
        return mozEncode && pixels
          ? new Blob(
              [
                await mozEncode(pixels, {
                  quality: Math.round(quality * 100),
                  progressive: true,
                }),
              ],
              { type: 'image/jpeg' },
            )
          : jpegBlob(canvas, quality);
      };
      let high = 0.95;
      let low = 0.1;
      const full = await encode(high);
      if (full.size <= limit) return { blob: full, width, height };
      let best = await encode(low);
      if (!smallest || best.size < smallest.blob.size)
        smallest = { blob: best, width, height };
      if (best.size <= limit) {
        for (let step = 0; step < 6; step++) {
          const quality = (low + high) / 2;
          const blob = await encode(quality);
          if (blob.size > limit) high = quality;
          else {
            low = quality;
            if (blob.size >= best.size) best = blob;
          }
        }
        return { blob: best, width, height };
      }
    } finally {
      canvas.width = 0;
    }
    width = Math.max(1, Math.round(width * 0.75));
    height = Math.max(1, Math.round(height * 0.75));
  }
  if (smallest) return smallest;
  throw new Error('Could not prepare an image.');
}
