'use client';

import { useEffect, useRef, useState } from 'react';
import type { Format, PreparedFile } from '@/lib/prepare-file/prepare';
import type { Requirements } from '@/lib/prepare-file/requirements';

type Output = PreparedFile & { url: string; previewUrl: string };

export function useFilePreparation(
  files: File[],
  format: Format,
  maximumKB: number,
  requirements: Requirements | null,
) {
  const active = useRef<AbortController | null>(null);
  const [output, setOutput] = useState<Output>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const validLimit =
    Number.isInteger(maximumKB) && maximumKB >= 1 && maximumKB <= 50_000;

  function invalidate() {
    active.current?.abort();
    setOutput(undefined);
    setError('');
    setBusy(false);
  }

  useEffect(() => {
    if (!files.length || !validLimit) return;

    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const { prepareFile } = await import('@/lib/prepare-file/prepare');
        signal.throwIfAborted();
        const result = await prepareFile(
          files,
          format,
          maximumKB,
          requirements,
          signal,
        );
        signal.throwIfAborted();
        const url = URL.createObjectURL(result.blob);
        const previewUrl = result.preview
          ? URL.createObjectURL(result.preview)
          : url;
        signal.addEventListener(
          'abort',
          () => {
            URL.revokeObjectURL(url);
            if (previewUrl !== url) URL.revokeObjectURL(previewUrl);
          },
          { once: true },
        );
        setOutput({ ...result, url, previewUrl });
      } catch (error) {
        if (!signal.aborted) {
          setError(
            error instanceof RangeError
              ? error.message
              : format === 'pdf'
                ? 'Couldn’t prepare this PDF. Try another file.'
                : 'Couldn’t read or prepare this image. Try another file.',
          );
        }
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [files, format, maximumKB, requirements, validLimit]);

  return { output, error, busy, validLimit, invalidate };
}
