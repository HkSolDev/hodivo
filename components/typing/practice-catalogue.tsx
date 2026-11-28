'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { loadPracticeCatalogue } from '../../lib/typing/practice-api';

import styles from './practice-catalogue.module.css';

type Catalogue = Awaited<ReturnType<typeof loadPracticeCatalogue>>;

export function PracticeCatalogue({
  buttonClass,
  onSelectHindi,
}: {
  buttonClass: string;
  onSelectHindi: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<{ cursor?: string }>({});
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    void loadPracticeCatalogue(request.signal, page.cursor, language).then(
      (result) => {
        if (!request.signal.aborted) setCatalogue(result);
      },
      () => {
        if (!request.signal.aborted) setFailed(true);
      },
    );
    return () => request.abort();
  }, [open, page, language]);

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
        className={styles.dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
      >
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id={titleId}>Browse passages</h2>
            <form method="dialog">
              <button className={styles.control} type="submit">
                Close
              </button>
            </form>
          </header>
          <div
            className={styles.languages}
            role="group"
            aria-label="Passage language"
          >
            {(['en', 'hi'] as const).map((option) => (
              <button
                key={option}
                className={styles.control}
                type="button"
                lang={option}
                aria-pressed={option === language}
                onClick={() => {
                  if (option === language) return;
                  setLanguage(option);
                  goTo();
                }}
              >
                {option === 'en' ? 'English' : 'हिन्दी'}
              </button>
            ))}
          </div>
          <div className={styles.body}>
            {process.env.NODE_ENV === 'development' &&
              language === 'hi' &&
              catalogue?.passages.length === 0 && (
                <button
                  className={styles.row}
                  type="button"
                  lang="hi"
                  onClick={() => {
                    dialog.current?.close();
                    onSelectHindi();
                  }}
                >
                  हिन्दी अभ्यास
                  <span className={styles.chevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              )}
            {failed ? (
              <div className={styles.status}>
                <p role="status">Passages unavailable.</p>
                <button
                  className={styles.control}
                  type="button"
                  onClick={() => goTo(page.cursor)}
                >
                  Retry catalogue
                </button>
              </div>
            ) : catalogue?.passages.length ? (
              <ul className={styles.list}>
                {catalogue.passages.map(({ id, title }) => (
                  <li key={id}>
                    <a
                      className={styles.row}
                      lang={language}
                      href={`/typing?passage=${encodeURIComponent(id)}`}
                    >
                      {title}
                      <span className={styles.chevron} aria-hidden="true">
                        ›
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.status} role="status">
                {catalogue
                  ? language === 'hi'
                    ? 'कोई हिन्दी अनुच्छेद उपलब्ध नहीं है।'
                    : 'No passages available.'
                  : 'Loading catalogue…'}
              </p>
            )}
          </div>
          {catalogue && (page.cursor || catalogue.nextCursor) && (
            <footer className={styles.footer}>
              {page.cursor && (
                <button
                  className={styles.control}
                  type="button"
                  onClick={() => goTo()}
                >
                  First page
                </button>
              )}
              {catalogue.nextCursor && (
                <button
                  className={styles.control}
                  type="button"
                  onClick={() => goTo(catalogue.nextCursor ?? undefined)}
                >
                  More passages
                </button>
              )}
            </footer>
          )}
        </div>
      </dialog>
    </>
  );
}
