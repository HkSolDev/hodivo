'use client';

import { useEffect, useRef, useState } from 'react';
import { loadPracticeCatalogue } from '../../lib/typing/practice-api';

type Catalogue = Awaited<ReturnType<typeof loadPracticeCatalogue>>;

export function PracticeCatalogue({
  buttonClass,
  onSelectHindi,
}: {
  buttonClass: string;
  onSelectHindi: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<{ cursor?: string }>({});
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    void loadPracticeCatalogue(request.signal, page.cursor).then(
      (result) => {
        if (!request.signal.aborted) setCatalogue(result);
      },
      () => {
        if (!request.signal.aborted) setFailed(true);
      },
    );
    return () => request.abort();
  }, [open, page]);

  function goTo(cursor?: string) {
    setCatalogue(null);
    setFailed(false);
    setPage({ cursor });
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          goTo();
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        Browse passages
      </button>
      <dialog
        ref={dialog}
        aria-label="Browse passages"
        onClose={() => setOpen(false)}
      >
        <form method="dialog">
          <button type="submit">Close</button>
        </form>
        {process.env.NODE_ENV === 'development' && (
          <p>
            <button
              type="button"
              lang="hi"
              onClick={() => {
                dialog.current?.close();
                onSelectHindi();
              }}
            >
              हिन्दी अभ्यास
            </button>
          </p>
        )}
        {failed ? (
          <button type="button" onClick={() => goTo(page.cursor)}>
            Retry catalogue
          </button>
        ) : catalogue ? (
          <>
            {catalogue.passages.length === 0 && <p>No passages available.</p>}
            <ul>
              {catalogue.passages.map(({ id, title }) => (
                <li key={id}>
                  <a href={`/typing?passage=${encodeURIComponent(id)}`}>
                    {title}
                  </a>
                </li>
              ))}
            </ul>
            {page.cursor && (
              <button type="button" onClick={() => goTo()}>
                First page
              </button>
            )}
            {catalogue.nextCursor && (
              <button
                type="button"
                onClick={() => goTo(catalogue.nextCursor ?? undefined)}
              >
                More passages
              </button>
            )}
          </>
        ) : (
          <p role="status">Loading catalogue…</p>
        )}
      </dialog>
    </>
  );
}
