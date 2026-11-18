'use client';

import Image from 'next/image';
import { useRef, useState, type FormEvent } from 'react';
import {
  formatBytes,
  isPdf,
  validateFiles,
} from '@/lib/prepare-file/file-types';
import type { Format } from '@/lib/prepare-file/prepare';
import type { Requirements } from '@/lib/prepare-file/requirements';
import { useFilePreparation } from './use-file-preparation';
import styles from './prepare-file.module.css';

const presets = [
  [20, 'Signature'],
  [50, 'Photo'],
  [100, 'ID card'],
  [200, 'Certificate'],
  [500, 'Multi-page'],
] as const;

export function PrepareFile() {
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<Format>('jpg');
  const [limit, setLimit] = useState('50');
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [intakeError, setIntakeError] = useState('');
  const maximumKB = Number(limit);
  const { output, error, busy, validLimit, invalidate } = useFilePreparation(
    files,
    format,
    maximumKB,
    requirements,
  );
  const pdfSource = files.length > 0 && isPdf(files[0]);
  const pdfOnly = pdfSource || files.length > 1;
  const aboveLimit = Boolean(output && output.blob.size > maximumKB * 1000);
  const belowMinimum = Boolean(
    output?.minimumBytes && output.blob.size < output.minimumBytes,
  );
  const canDownload =
    output &&
    !belowMinimum &&
    (!aboveLimit || (format === 'jpg' && !requirements));
  const suggestedKB = output && Math.ceil(output.blob.size / 1000);
  const sourceSize = files.reduce((sum, file) => sum + file.size, 0);
  const filename = files.length > 1 ? `${files.length} images` : files[0]?.name;

  function selectFiles(selected: File[]) {
    if (!selected.length) return;
    const invalid = validateFiles(selected);
    setIntakeError(invalid ?? '');
    if (invalid) return;
    invalidate();
    setFiles(selected);
    if (selected.length > 1 || isPdf(selected[0])) setFormat('pdf');
  }

  function changeLimit(value: string) {
    if (Number(value) !== maximumKB) invalidate();
    setLimit(value);
  }

  function applyRequirements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      width: String(form.get('width') ?? ''),
      height: String(form.get('height') ?? ''),
      minimum: String(form.get('minimum') ?? ''),
    };
    const next = Object.values(values).some(Boolean) ? values : null;
    if (!next && !requirements) return;
    invalidate();
    setRequirements(next);
  }

  const choose = () => picker.current?.click();
  const status = busy
    ? 'Preparing…'
    : output
      ? aboveLimit
        ? 'Exceeds limit'
        : belowMinimum
          ? 'Below minimum'
          : 'Fits limit'
      : '—';

  return (
    <div className={styles.workspace}>
      <div className={styles.stack}>
        <section
          className={styles.card}
          aria-labelledby="prepare-source"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            selectFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <h2 id="prepare-source">Source document</h2>
          <input
            ref={picker}
            type="file"
            aria-label="Source files"
            hidden
            multiple
            accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            onChange={(event) => {
              selectFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }}
          />
          {filename ? (
            <div className={styles.source}>
              <div>
                <strong title={filename}>{filename}</strong>
                <small>
                  {formatBytes(sourceSize)}
                  {output && ` · ${output.sourceDetails}`}
                </small>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={choose}
              >
                Change
              </button>
            </div>
          ) : (
            <div className={styles.dropzone}>
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3M12 16V4m-5 5 5-5 5 5"
                />
              </svg>
              <button
                type="button"
                className="button button-primary"
                onClick={choose}
              >
                Choose a file
              </button>
              <small>
                Drop files here or choose a JPG, PNG, WebP, HEIC, HEIF or PDF.
                Up to 50 MB total.
              </small>
            </div>
          )}
          {intakeError && (
            <p className={styles.warning} role="alert">
              {intakeError}
            </p>
          )}
        </section>

        <section className={styles.card} aria-labelledby="prepare-format">
          <h2 id="prepare-format">Format &amp; limit</h2>
          <div className={styles.stack}>
            <div
              className={styles.formats}
              role="group"
              aria-label="Export format"
            >
              {(['jpg', 'pdf'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={format === option}
                  disabled={option === 'jpg' && pdfOnly}
                  className={`button ${format === option ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => {
                    if (option === format) return;
                    invalidate();
                    setFormat(option);
                  }}
                >
                  Export as {option.toUpperCase()}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="prepare-limit" className={styles.label}>
                Maximum file size
              </label>
              <div className={styles.field}>
                <input
                  type="number"
                  id="prepare-limit"
                  min="1"
                  max="50000"
                  value={limit}
                  aria-invalid={!validLimit}
                  onChange={(event) => changeLimit(event.target.value)}
                />
                <span aria-hidden="true">KB</span>
              </div>
              {!validLimit && (
                <small role="alert">
                  Enter a whole number from 1 to 50,000 KB.
                </small>
              )}
            </div>

            <div>
              <small>Common upload limits</small>
              <div className={styles.presets}>
                {presets.map(([kb, label]) => (
                  <button
                    key={kb}
                    type="button"
                    aria-pressed={maximumKB === kb}
                    className={`button ${maximumKB === kb ? 'button-primary' : 'button-secondary'}`}
                    onClick={() => changeLimit(String(kb))}
                  >
                    {kb} KB {label}
                  </button>
                ))}
              </div>
            </div>

            <details className={styles.requirements} hidden={format !== 'jpg'}>
              <summary>
                More requirements for JPG <small>Optional</small>
              </summary>
              <form
                className={styles.requirementsForm}
                onSubmit={applyRequirements}
              >
                <p>
                  Set exact dimensions only if your form requires them. White
                  margins preserve the image’s proportions without cropping.
                </p>
                <div className={styles.requirementFields}>
                  {(
                    [
                      ['width', 'Width (px)', 1, 4096],
                      ['height', 'Height (px)', 1, 4096],
                      ['minimum', 'Minimum size (KB)', 1, 50000],
                    ] as const
                  ).map(([name, label, min, max]) => (
                    <label key={name} className={styles.label}>
                      {label}
                      <span className={styles.field}>
                        <input type="number" name={name} min={min} max={max} />
                      </span>
                    </label>
                  ))}
                </div>
                <button className="button button-secondary" type="submit">
                  Apply requirements
                </button>
              </form>
            </details>

            {format === 'pdf' && (
              <p className={styles.note}>
                {pdfOnly &&
                  !pdfSource &&
                  'Multiple images are exported together as a PDF. '}
                Compressing an existing PDF turns each page into an image. Small
                text can become less sharp, and selectable text and links are
                lost.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className={styles.card} aria-labelledby="prepare-preview">
        <div className={styles.previewHeading}>
          <h2 id="prepare-preview">Verification &amp; preview</h2>
          <span
            className={styles.status}
            data-state={
              aboveLimit || belowMinimum
                ? 'warning'
                : output
                  ? 'success'
                  : 'idle'
            }
            role="status"
          >
            {status}
          </span>
        </div>
        <dl className={styles.metrics}>
          <div>
            <dt>Original file</dt>
            <dd>{files.length ? formatBytes(sourceSize) : '—'}</dd>
            {output && <small>{output.sourceDetails}</small>}
          </div>
          <div>
            <dt>Prepared output</dt>
            <dd>{output ? formatBytes(output.blob.size) : '—'}</dd>
            {output && <small>{output.outputDetails}</small>}
          </div>
        </dl>
        {error && (
          <p className={styles.warning} role="alert">
            {error}
          </p>
        )}
        {output && (aboveLimit || belowMinimum) && (
          <div className={styles.warning}>
            <p role="alert">
              {belowMinimum
                ? `The result is ${output.blob.size.toLocaleString()} bytes, below the requested minimum.`
                : `Couldn’t reach ${maximumKB} KB. Smallest result found: ${formatBytes(output.blob.size)} (${output.blob.size.toLocaleString()} bytes).`}
            </p>
            {aboveLimit &&
              format === 'pdf' &&
              suggestedKB &&
              suggestedKB <= 50_000 && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => changeLimit(String(suggestedKB))}
                >
                  Try a {suggestedKB} KB limit
                </button>
              )}
          </div>
        )}
        <div className={styles.preview} aria-busy={busy}>
          {output ? (
            <Image
              src={output.previewUrl}
              unoptimized
              width={320}
              height={300}
              alt={
                format === 'pdf' ? 'First prepared PDF page' : 'Prepared JPG'
              }
            />
          ) : (
            <p>
              {busy
                ? 'Preparing your file…'
                : 'Your prepared file will appear here.'}
            </p>
          )}
        </div>
        {canDownload ? (
          <a
            className={`button button-primary ${styles.download}`}
            href={output.url}
            download={`${files[0].name.replace(/\.[^/.]+$/, '')}_prepared_${maximumKB}kb.${format}`}
          >
            Download {format.toUpperCase()} ({formatBytes(output.blob.size)})
          </a>
        ) : (
          <button
            type="button"
            className={`button button-primary ${styles.download}`}
            disabled
          >
            Download {format.toUpperCase()}
          </button>
        )}
        {files.length > 0 && (
          <button
            type="button"
            className="button button-secondary"
            onClick={choose}
          >
            Choose another file
          </button>
        )}
      </section>
    </div>
  );
}
