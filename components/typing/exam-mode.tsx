'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
} from 'react';
import Link from 'next/link';
import type {
  ExamReason,
  ExamSummary,
  ExamVersionSummary,
  ExamVersionDetail,
  ExamStartSnapshot,
  ExamSession,
} from '../../lib/typing/exam-contract';
import {
  createExamSession,
  advanceExamSession,
  finishExamSession,
  resetExamSession,
} from '../../lib/typing/exam-session';
import {
  applyExamInput,
  isSupportedExamInputType,
} from '../../lib/typing/exam-input';
import {
  loadExams,
  loadExamVersions,
  loadExamVersion,
  loadExamSnapshot,
  ExamApiError,
} from '../../lib/typing/exam-api';
import styles from './exam-mode.module.css';

const REASON_MESSAGES: Record<ExamReason, string> = {
  RULES_INCOMPLETE: 'Exam configuration is incomplete.',
  RULES_UNSUPPORTED: 'Exam configuration is not supported for simulation.',
  SCORING_UNAVAILABLE: 'Official scoring method is unavailable.',
  NO_ELIGIBLE_PASSAGE:
    'No eligible passage is published for this exam version.',
};

function formatRemainingTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

function countWords(str: string): number {
  const trimmed = str.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function ExamMode() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examsNextCursor, setExamsNextCursor] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [versions, setVersions] = useState<ExamVersionSummary[]>([]);
  const [versionsNextCursor, setVersionsNextCursor] = useState<string | null>(
    null,
  );
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [versionDetail, setVersionDetail] = useState<ExamVersionDetail | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<ExamStartSnapshot | null>(null);
  const [isLoadingExams, setIsLoadingExams] = useState(true);
  const [isLoadingMoreExams, setIsLoadingMoreExams] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isLoadingMoreVersions, setIsLoadingMoreVersions] = useState(false);
  const [isLoadingVersionDetail, setIsLoadingVersionDetail] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [localText, setLocalText] = useState('');
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>(
    'normal',
  );
  const sessionRef = useRef<ExamSession | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const submitDialogRef = useRef<HTMLDialogElement | null>(null);
  const restartDialogRef = useRef<HTMLDialogElement | null>(null);
  const changeVersionDialogRef = useRef<HTMLDialogElement | null>(null);
  const resultDialogRef = useRef<HTMLDialogElement | null>(null);
  const examsAbortRef = useRef<AbortController | null>(null);
  const versionsAbortRef = useRef<AbortController | null>(null);
  const snapshotAbortRef = useRef<AbortController | null>(null);

  const commitSession = useCallback((next: ExamSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (!isComposingRef.current || !next || next.phase === 'finished')
      setLocalText(next?.text ?? '');
  }, []);

  const fetchExams = useCallback(async (cursor?: string) => {
    examsAbortRef.current?.abort();
    const controller = new AbortController();
    examsAbortRef.current = controller;
    if (cursor) setIsLoadingMoreExams(true);
    else setIsLoadingExams(true);
    setErrorMessage(null);
    try {
      const page = await loadExams(controller.signal, cursor);
      if (controller.signal.aborted) return;
      setExams((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setExamsNextCursor(page.nextCursor);
    } catch (error) {
      if (!controller.signal.aborted)
        setErrorMessage(
          error instanceof ExamApiError
            ? error.message
            : 'Unable to load exams. Please retry.',
        );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingExams(false);
        setIsLoadingMoreExams(false);
      }
    }
  }, []);
  useEffect(() => {
    void fetchExams();
    return () => examsAbortRef.current?.abort();
  }, [fetchExams, retry]);

  const fetchVersions = useCallback(async (examId: string, cursor?: string) => {
    versionsAbortRef.current?.abort();
    const controller = new AbortController();
    versionsAbortRef.current = controller;
    if (cursor) setIsLoadingMoreVersions(true);
    else setIsLoadingVersions(true);
    setErrorMessage(null);
    try {
      const page = await loadExamVersions(examId, controller.signal, cursor);
      if (controller.signal.aborted) return;
      setVersions((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setVersionsNextCursor(page.nextCursor);
    } catch (error) {
      if (!controller.signal.aborted)
        setErrorMessage(
          error instanceof ExamApiError
            ? error.message
            : 'Unable to load versions. Please retry.',
        );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingVersions(false);
        setIsLoadingMoreVersions(false);
      }
    }
  }, []);
  useEffect(() => {
    if (selectedExamId) void fetchVersions(selectedExamId);
    return () => versionsAbortRef.current?.abort();
  }, [selectedExamId, fetchVersions, retry]);

  useEffect(() => {
    if (!selectedVersionId || sessionRef.current) return;
    const controller = new AbortController();
    setIsLoadingVersionDetail(true);
    setErrorMessage(null);
    loadExamVersion(selectedVersionId, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setVersionDetail(detail);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setErrorMessage(
            error instanceof ExamApiError
              ? error.message
              : 'Unable to load exam rules. Please retry.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingVersionDetail(false);
      });
    return () => controller.abort();
  }, [selectedVersionId, retry]);

  const loadPassage = async () => {
    if (!versionDetail?.readiness.canStart || sessionRef.current) return;
    snapshotAbortRef.current?.abort();
    const controller = new AbortController();
    snapshotAbortRef.current = controller;
    setIsLoadingSnapshot(true);
    setErrorMessage(null);
    try {
      const loaded = await loadExamSnapshot(
        versionDetail.id,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setSnapshot(loaded);
      setVersionDetail(loaded.version);
      commitSession(createExamSession(loaded));
    } catch (error) {
      if (!controller.signal.aborted)
        setErrorMessage(
          error instanceof ExamApiError
            ? error.message
            : 'Unable to prepare this exam. Please retry.',
        );
    } finally {
      if (!controller.signal.aborted) setIsLoadingSnapshot(false);
    }
  };
  useEffect(() => () => snapshotAbortRef.current?.abort(), []);

  const clearSelection = () => {
    snapshotAbortRef.current?.abort();
    setIsLoadingSnapshot(false);
    setIsLoadingVersionDetail(false);
    setVersionDetail(null);
    setSelectedVersionId('');
    setSnapshot(null);
    commitSession(null);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const beforeInput = (event: InputEvent) => {
      const current = sessionRef.current;
      if (!current) {
        event.preventDefault();
        return;
      }
      const advanced = advanceExamSession(current, performance.now());
      if (advanced !== current) commitSession(advanced);
      if (
        advanced.phase === 'finished' ||
        !isSupportedExamInputType(event.inputType)
      )
        event.preventDefault();
    };
    const block = (event: Event) => {
      event.preventDefault();
      if (sessionRef.current)
        commitSession(
          advanceExamSession(sessionRef.current, performance.now()),
        );
    };
    const composeStart = () => {
      isComposingRef.current = true;
    };
    const composeEnd = () => {
      isComposingRef.current = false;
      const current = sessionRef.current;
      if (current)
        commitSession(
          applyExamInput(
            current,
            textarea.value,
            'insertCompositionText',
            performance.now(),
          ),
        );
    };
    textarea.addEventListener('beforeinput', beforeInput);
    textarea.addEventListener('paste', block);
    textarea.addEventListener('drop', block);
    textarea.addEventListener('compositionstart', composeStart);
    textarea.addEventListener('compositionend', composeEnd);
    return () => {
      textarea.removeEventListener('beforeinput', beforeInput);
      textarea.removeEventListener('paste', block);
      textarea.removeEventListener('drop', block);
      textarea.removeEventListener('compositionstart', composeStart);
      textarea.removeEventListener('compositionend', composeEnd);
    };
  }, [commitSession]);

  const phase = session?.phase;
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => {
      const current = sessionRef.current;
      if (current) {
        const advanced = advanceExamSession(current, performance.now());
        if (advanced !== current) commitSession(advanced);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [phase, commitSession]);
  useEffect(() => {
    if (phase !== 'finished') return;
    submitDialogRef.current?.close();
    restartDialogRef.current?.close();
    changeVersionDialogRef.current?.close();
    if (resultDialogRef.current && !resultDialogRef.current.open)
      resultDialogRef.current.showModal();
  }, [phase]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const current = sessionRef.current;
    if (!current) return;
    const native = event.nativeEvent;
    const inputType = native instanceof InputEvent ? native.inputType : '';
    if (isComposingRef.current) {
      const advanced = advanceExamSession(current, performance.now());
      if (advanced.phase === 'finished') commitSession(advanced);
      else setLocalText(event.target.value);
      return;
    }
    commitSession(
      applyExamInput(current, event.target.value, inputType, performance.now()),
    );
  };
  const handleInsertTab = () => {
    const input = textareaRef.current;
    const current = sessionRef.current;
    if (!input || !current || isComposingRef.current) return;
    const start = input.selectionStart;
    const text =
      current.text.slice(0, start) +
      '\t' +
      current.text.slice(input.selectionEnd);
    const next = applyExamInput(current, text, 'insertText', performance.now());
    commitSession(next);
    input.focus();
    requestAnimationFrame(() => {
      if (next.text === text) input.setSelectionRange(start + 1, start + 1);
    });
  };
  const rememberFocus = () => {
    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };
  const handleOpenSubmit = () => {
    const current = sessionRef.current;
    if (!current || current.phase !== 'running') return;
    const advanced = advanceExamSession(current, performance.now());
    commitSession(advanced);
    if (advanced.phase === 'running') {
      rememberFocus();
      submitDialogRef.current?.showModal();
    }
  };
  const handleCancelSubmit = () => submitDialogRef.current?.close();
  const handleConfirmSubmit = () => {
    submitDialogRef.current?.close();
    if (sessionRef.current)
      commitSession(finishExamSession(sessionRef.current, performance.now()));
  };
  const handleOpenRestart = () => {
    rememberFocus();
    restartDialogRef.current?.showModal();
  };
  const performReset = () => {
    const current = sessionRef.current;
    if (!current) return;
    const advanced = advanceExamSession(current, performance.now());
    if (current.phase === 'running' && advanced.phase === 'finished') {
      commitSession(advanced);
      return;
    }
    restartDialogRef.current?.close();
    resultDialogRef.current?.close();
    isComposingRef.current = false;
    commitSession(resetExamSession(advanced));
    textareaRef.current?.focus();
  };
  const confirmVersionChange = () => {
    const current = sessionRef.current;
    if (current?.phase === 'running') {
      const advanced = advanceExamSession(current, performance.now());
      if (advanced.phase === 'finished') {
        commitSession(advanced);
        return;
      }
    }
    changeVersionDialogRef.current?.close();
    clearSelection();
    requestAnimationFrame(() =>
      document.getElementById('version-select')?.focus(),
    );
  };
  const isSessionActive = session !== null || isLoadingSnapshot;
  const passageLength = snapshot?.passage.text.length ?? 0;
  const typedLength = session?.text.length ?? 0;
  const remainingStrokes = Math.max(0, passageLength - typedLength);
  const wordCount = countWords(session?.text ?? '');
  const remainingSecs = session?.remainingSeconds ?? 600;

  return (
    <div
      className={`${
        styles.examLayout
      } ${fontSize === 'small' ? styles.fontSizeSmall : fontSize === 'large' ? styles.fontSizeLarge : styles.fontSizeNormal}`}
    >
      {/* Reference-style simulation header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.brandBadge}>EXAM</div>
          <div className={styles.headerMeta}>
            <div className={styles.selectorRow}>
              <label htmlFor="exam-select" className={styles.srOnly}>
                Exam
              </label>
              <select
                id="exam-select"
                className={styles.selectControl}
                value={selectedExamId}
                disabled={
                  isSessionActive || isLoadingExams || exams.length === 0
                }
                onChange={(e) => {
                  if (e.target.value === selectedExamId) return;
                  clearSelection();
                  setSelectedVersionId('');
                  setVersions([]);
                  setVersionsNextCursor(null);
                  setSelectedExamId(e.target.value);
                }}
              >
                <option value="">Select an exam</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} {ex.organization ? `(${ex.organization})` : ''}
                  </option>
                ))}
              </select>
              {examsNextCursor && (
                <button
                  type="button"
                  className={styles.btnInline}
                  disabled={isSessionActive || isLoadingMoreExams}
                  onClick={() => void fetchExams(examsNextCursor)}
                >
                  {isLoadingMoreExams ? 'Loading...' : 'More Exams'}
                </button>
              )}

              <label htmlFor="version-select" className={styles.srOnly}>
                Version
              </label>
              <select
                id="version-select"
                className={styles.selectControl}
                value={selectedVersionId}
                disabled={
                  isSessionActive || isLoadingVersions || versions.length === 0
                }
                onChange={(e) => {
                  if (e.target.value === selectedVersionId) return;
                  clearSelection();
                  setSelectedVersionId(e.target.value);
                }}
              >
                <option value="">Select a version</option>
                {versions.map((ver) => (
                  <option key={ver.id} value={ver.id}>
                    {ver.label} {ver.examYear ? `(${ver.examYear})` : ''}
                  </option>
                ))}
              </select>
              {versionsNextCursor && (
                <button
                  type="button"
                  className={styles.btnInline}
                  disabled={isSessionActive || isLoadingMoreVersions}
                  onClick={() =>
                    selectedExamId &&
                    void fetchVersions(selectedExamId, versionsNextCursor)
                  }
                >
                  {isLoadingMoreVersions ? 'Loading...' : 'More Versions'}
                </button>
              )}
            </div>
            <span className={styles.headerSub}>
              {versionDetail
                ? `${versionDetail.rules.durationSeconds ?? 'Unspecified'} seconds | ${versionDetail.rules.targetWpm ?? 'Unspecified'} WPM target`
                : 'Select an exam version to inspect its rules'}{' '}
              | Simulation
            </span>
          </div>
        </div>

        <div className={styles.headerCenter}>
          <div className={styles.nodeBadge}>
            <span>Node:</span>
            <strong className={styles.nodeVal}>LOCAL SIMULATION</strong>
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* Candidate Card */}
          <div className={styles.candidateCard}>
            <div className={styles.candidateAvatar}>
              <svg
                viewBox="0 0 24 24"
                fill="#94a3b8"
                width="28"
                height="34"
                aria-hidden="true"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <div className={styles.candidateDetails}>
              <div className={styles.candidateName}>SIMULATION CANDIDATE</div>
              <div className={styles.candidateMeta}>
                Mode: <strong>Local session</strong>
              </div>
              <div className={styles.candidateMeta}>
                Medium: <strong>English</strong>
              </div>
            </div>
          </div>

          {/* Countdown Timer */}
          <div
            className={`${
              styles.timer
            } ${remainingSecs <= 60 ? styles.timerCritical : remainingSecs <= 120 ? styles.timerWarning : styles.timerSafe}`}
          >
            <span className={styles.timerLabel}>Time Left</span>
            <span
              className={styles.timerDigits}
              aria-label="Time remaining"
              aria-live="off"
            >
              {formatRemainingTime(remainingSecs)}
            </span>
          </div>
        </div>
      </header>

      {/* 2. Controls & Counters Bar */}
      <nav className={styles.toolbar} aria-label="Controls and Counters Bar">
        <div className={styles.toolbarSection}>
          <span className={styles.toolbarLabel}>Passage:</span>
          <strong style={{ fontSize: '0.82rem' }}>
            {snapshot?.passage.title ?? 'No passage selected'}
          </strong>

          {/* Font Zoom Controls */}
          <div className={styles.zoomControls}>
            <span className={styles.toolbarLabel}>Text Size:</span>
            <button
              type="button"
              className={`${styles.btnZoom} ${fontSize === 'small' ? styles.btnZoomActive : ''}`}
              onClick={() => setFontSize('small')}
              title="Decrease Font Size"
            >
              A-
            </button>
            <button
              type="button"
              className={`${styles.btnZoom} ${fontSize === 'normal' ? styles.btnZoomActive : ''}`}
              onClick={() => setFontSize('normal')}
              title="Normal Font Size"
            >
              A
            </button>
            <button
              type="button"
              className={`${styles.btnZoom} ${fontSize === 'large' ? styles.btnZoomActive : ''}`}
              onClick={() => setFontSize('large')}
              title="Increase Font Size"
            >
              A+
            </button>
          </div>

          {/* Backspace Pill */}
          <div className={styles.rulePill}>
            <span className={styles.ruleDot} />
            <span>
              Backspace:{' '}
              <strong>
                {versionDetail?.rules.backspacePolicy ?? 'Unspecified'}
              </strong>
            </span>
          </div>
        </div>

        {/* Counters */}
        <div className={styles.toolbarSection}>
          <div className={styles.statPill}>
            <span>Passage characters:</span>
            <strong className={styles.statValue}>
              {passageLength.toLocaleString()}
            </strong>
          </div>
          <div className={styles.statPill}>
            <span>Typed characters:</span>
            <strong className={styles.statValue}>
              {typedLength.toLocaleString()}
            </strong>
          </div>
          <div className={styles.statPill}>
            <span>Remaining:</span>
            <strong className={styles.statValue}>
              {remainingStrokes.toLocaleString()}
            </strong>
          </div>
          <div className={styles.statPill}>
            <span>Words:</span>
            <strong className={styles.statValue}>
              {wordCount.toLocaleString()}
            </strong>
          </div>
        </div>
      </nav>

      {/* Error / Readiness Banner */}
      {errorMessage && (
        <div
          className={`${styles.alertBanner} ${styles.alertError}`}
          role="alert"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            className={styles.btnInline}
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {versionDetail && !versionDetail.readiness.canStart && (
        <div className={`${styles.alertBanner} ${styles.alertWarning}`}>
          <div>
            <strong>
              This exam configuration is not ready for simulation:
            </strong>
            <ul className={styles.alertReasonsList}>
              {versionDetail.readiness.reasons.map((r) => (
                <li key={r}>{REASON_MESSAGES[r] ?? r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {isLoadingExams && <p role="status">Loading exams...</p>}
      {!isLoadingExams && !errorMessage && exams.length === 0 && (
        <p role="status">No published exams are available.</p>
      )}
      {selectedExamId && !isLoadingVersions && versions.length === 0 && (
        <p role="status">No published versions are available.</p>
      )}
      {versionDetail && (
        <section className={styles.toolbar} aria-label="Exam instructions">
          <details open={!session}>
            <summary>Instructions and passage source</summary>
            <strong>{versionDetail.label}</strong>
            <p>
              {versionDetail.rules.instructions ??
                'Read the passage and type it in the answer field.'}
            </p>
            <p>
              Typing starts the clock. Corrections are allowed in the supported
              simulation. Paste and drop are blocked. Confirmation does not
              pause the clock. Official scoring is unavailable.
            </p>
            {snapshot && (
              <p>
                Passage source:{' '}
                {snapshot.passage.sourceKind === 'OFFICIAL_PREVIOUS_YEAR'
                  ? 'Official previous-year'
                  : snapshot.passage.sourceKind === 'RECONSTRUCTED'
                    ? 'Reconstructed'
                    : 'Practice'}
                {snapshot.passage.sourceNote
                  ? ` — ${snapshot.passage.sourceNote}`
                  : ''}
              </p>
            )}
          </details>
          {!session && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void loadPassage()}
              disabled={!versionDetail.readiness.canStart || isLoadingSnapshot}
            >
              {isLoadingSnapshot ? 'Loading passage...' : 'Load passage'}
            </button>
          )}
          {session && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => {
                rememberFocus();
                changeVersionDialogRef.current?.showModal();
              }}
            >
              Choose another version
            </button>
          )}
        </section>
      )}
      {/* 3. Split Screen: Master Passage & Candidate Input */}
      <div className={styles.splitScreen}>
        {/* Master Passage */}
        <section className={styles.panel} aria-labelledby="passage-heading">
          <div className={styles.panelHeader}>
            <h2 id="passage-heading" className={styles.panelTitle}>
              Master Text Passage
            </h2>
            <span className={styles.panelHint}>
              ⚠ Read-only. Does not auto-scroll. Use mouse wheel or scrollbar to
              advance.
            </span>
          </div>
          <div className={styles.passageContent}>
            {isLoadingVersionDetail || isLoadingSnapshot ? (
              <p style={{ color: '#64748b' }}>Loading master passage...</p>
            ) : (
              (snapshot?.passage.text ??
              'Select a ready exam version to load passage.')
            )}
          </div>
        </section>

        {/* Typing Input Area */}
        <section className={styles.panel} aria-labelledby="input-heading">
          <div className={styles.panelHeader}>
            <h2 id="input-heading" className={styles.panelTitle}>
              Candidate Typing Area
            </h2>
            <span className={styles.panelHint}>
              {session?.phase === 'running'
                ? 'Test in progress. Editing and navigation permitted.'
                : session?.phase === 'finished'
                  ? 'Test submitted / expired. Typing box is read-only.'
                  : 'Click below and type. Timer begins on your first accepted text insertion.'}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="typing-textarea"
            className={styles.typingTextarea}
            placeholder="Click here and begin typing according to the master passage above..."
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            aria-label="Your answer"
            disabled={!session}
            readOnly={session?.phase === 'finished'}
            value={localText}
            onChange={handleTextareaChange}
          />
        </section>
      </div>

      {/* 4. Footer Action Bar */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <Link href="/typing" className={styles.exitLink}>
            ← Return to Practice Mode
          </Link>
          <span className={styles.footerWarning}>
            Reloading or leaving this page discards your local session.
          </span>
        </div>

        <div className={styles.footerActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleInsertTab}
            disabled={!session || session.phase === 'finished'}
            title="Insert a Tab character into candidate text"
          >
            Insert Tab
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleOpenRestart}
            disabled={!session || session.phase === 'ready'}
          >
            Restart examination
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleOpenSubmit}
            disabled={!session || session.phase !== 'running'}
          >
            Submit examination
          </button>
        </div>
      </footer>

      <dialog
        ref={changeVersionDialogRef}
        className={styles.dialog}
        aria-labelledby="change-version-title"
        onClose={() => {
          if (!resultDialogRef.current?.open)
            lastFocusedElementRef.current?.focus();
        }}
      >
        <div className={styles.dialogHeader}>
          <h3 id="change-version-title" className={styles.dialogTitle}>
            Choose another version?
          </h3>
        </div>
        <div className={styles.dialogBody}>
          <p>
            Your local answer will be discarded. A running clock continues until
            you confirm.
          </p>
        </div>
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => changeVersionDialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={confirmVersionChange}
          >
            Confirm version change
          </button>
        </div>
      </dialog>
      {/* 5. Submit Confirmation Dialog */}
      <dialog
        ref={submitDialogRef}
        className={styles.dialog}
        aria-labelledby="submit-dialog-title"
        onClose={() => {
          if (!resultDialogRef.current?.open)
            lastFocusedElementRef.current?.focus();
        }}
      >
        <div className={styles.dialogHeader}>
          <h3 id="submit-dialog-title" className={styles.dialogTitle}>
            Submit Examination Confirmation
          </h3>
        </div>
        <div className={styles.dialogBody}>
          <p className={styles.dialogWarningText}>
            Are you sure you want to finish and submit your typing test?
          </p>
          <div className={styles.dialogSummaryGrid}>
            <div className={styles.dialogStatRow}>
              <span>Total Characters Typed:</span>
              <strong>{typedLength.toLocaleString()}</strong>
            </div>
            <div className={styles.dialogStatRow}>
              <span>Total Words Typed:</span>
              <strong>{wordCount.toLocaleString()}</strong>
            </div>
            <div className={styles.dialogStatRow}>
              <span>Time Remaining:</span>
              <strong>{formatRemainingTime(remainingSecs)}</strong>
            </div>
          </div>
          <p className={styles.dialogNote}>
            Note: The confirmation clock keeps running. Once submitted, your
            simulation will finish and you cannot make further edits.
          </p>
        </div>
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleCancelSubmit}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={handleConfirmSubmit}
          >
            Confirm submission
          </button>
        </div>
      </dialog>

      {/* 6. Restart Confirmation Dialog */}
      <dialog
        ref={restartDialogRef}
        className={styles.dialog}
        aria-labelledby="restart-dialog-title"
        onClose={() => {
          if (!resultDialogRef.current?.open)
            lastFocusedElementRef.current?.focus();
        }}
      >
        <div className={styles.dialogHeader}>
          <h3 id="restart-dialog-title" className={styles.dialogTitle}>
            Reset Examination Confirmation
          </h3>
        </div>
        <div className={styles.dialogBody}>
          <p className={styles.dialogWarningText}>
            Are you sure you want to reset your exam? Your current progress will
            be lost, and the same snapshot will restart.
          </p>
        </div>
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => restartDialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={performReset}
          >
            Confirm restart
          </button>
        </div>
      </dialog>

      {/* 7. Simulation completion dialog */}
      <dialog
        ref={resultDialogRef}
        className={`${styles.dialog} ${styles.dialogResult}`}
        aria-labelledby="result-dialog-title"
        onClose={() => resultDialogRef.current?.close()}
      >
        <div className={styles.dialogHeader}>
          <h3 id="result-dialog-title" className={styles.dialogTitle}>
            Examination simulation complete
          </h3>
        </div>
        <div className={styles.dialogBody}>
          <div className={styles.resultBanner}>
            <div className={styles.resultBadge}>
              {session?.finishReason === 'expired'
                ? 'Time Expired'
                : 'Submitted'}
            </div>
            <p className={styles.resultSummary}>
              Official scoring is unavailable.
            </p>
          </div>

          <div className={styles.scoreGrid}>
            <div className={`${styles.scoreCard} ${styles.scoreCardHero}`}>
              <span className={styles.scoreCardLabel}>
                Final answer characters
              </span>
              <strong className={styles.scoreCardVal}>
                {typedLength.toLocaleString()}
              </strong>
              <span className={styles.scoreCardSub}>
                Passage length: {passageLength.toLocaleString()}
              </span>
            </div>
            <div className={`${styles.scoreCard} ${styles.scoreCardHero}`}>
              <span className={styles.scoreCardLabel}>Total Words Typed</span>
              <strong className={styles.scoreCardVal}>
                {wordCount.toLocaleString()}
              </strong>
              <span className={styles.scoreCardSub}>
                Standard space-separated words
              </span>
            </div>
            <div className={styles.scoreCard}>
              <span className={styles.scoreCardLabel}>Time Taken</span>
              <strong className={styles.scoreCardVal}>
                {versionDetail?.rules.durationSeconds
                  ? `${Math.max(0, versionDetail.rules.durationSeconds - remainingSecs)}s`
                  : `${600 - remainingSecs}s`}
              </strong>
              <span className={styles.scoreCardSub}>
                Duration profile: {versionDetail?.rules.durationSeconds ?? 600}s
              </span>
            </div>
            <div className={styles.scoreCard}>
              <span className={styles.scoreCardLabel}>Evaluation Status</span>
              <strong className={styles.scoreCardVal}>Unavailable</strong>
              <span className={styles.scoreCardSub}>
                Official SSC scorer not implemented
              </span>
            </div>
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => resultDialogRef.current?.close()}
          >
            Close summary
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => {
              resultDialogRef.current?.close();
              handleOpenRestart();
            }}
          >
            Restart examination
          </button>
        </div>
      </dialog>
    </div>
  );
}
