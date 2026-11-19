import { isPdf, isHeic } from './file-types';
import type { Requirements } from './requirements';

export type Format = 'jpg' | 'pdf';
export type PreparedFile = {
  blob: Blob;
  preview?: Blob;
  sourceDetails: string;
  outputDetails: string;
  minimumBytes?: number;
};

export async function prepareFile(
  files: File[],
  format: Format,
  maximumKB: number,
  requirements: Requirements | null,
  signal: AbortSignal,
): Promise<PreparedFile> {
  const minimumBytes =
    format === 'pdf' && requirements?.minimum
      ? (await import('./requirements')).readMinimumBytes(
          requirements.minimum,
          maximumKB,
        )
      : undefined;

  if (isPdf(files[0])) {
    const { fitPdf } = await import('./pdf');
    const result = await fitPdf(files[0], maximumKB * 1000, signal);
    const pages =
      result.pageCount === 1 ? '1 page' : `${result.pageCount} pages`;
    return {
      ...result,
      sourceDetails: pages,
      outputDetails: pages,
      minimumBytes,
    };
  }

  const checks =
    format === 'jpg' && requirements
      ? (await import('./requirements')).readRequirements(
          requirements,
          maximumKB,
        )
      : undefined;

  const bitmaps: ImageBitmap[] = [];
  try {
    for (const file of files) {
      signal.throwIfAborted();
      try {
        bitmaps.push(
          await createImageBitmap(file, { imageOrientation: 'from-image' }),
        );
      } catch (error) {
        if (!isHeic(file)) throw error;
        throw new RangeError(
          'Could not open this HEIC or HEIF file. Try a JPG or PNG copy.',
        );
      }
    }
    signal.throwIfAborted();
    const [first] = bitmaps;
    const sourceDetails =
      bitmaps.length === 1
        ? `${first.width} × ${first.height} px`
        : `${bitmaps.length} images`;
    if (format === 'pdf') {
      const { fitPdf } = await import('./pdf');
      const result = await fitPdf(bitmaps, maximumKB * 1000, signal);
      return {
        ...result,
        sourceDetails,
        outputDetails:
          result.pageCount === 1 ? '1 page' : `${result.pageCount} pages`,
        minimumBytes,
      };
    }
    const { fitImage } = await import('./image');
    const result = await fitImage(first, maximumKB, signal, checks);
    return {
      blob: result.blob,
      sourceDetails,
      outputDetails: `${result.width} × ${result.height} px`,
      minimumBytes: checks?.minimumBytes,
    };
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
  }
}
