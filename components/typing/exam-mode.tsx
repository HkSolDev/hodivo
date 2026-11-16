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
  ExamPassageSummary,
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
  loadExamPassages,
  loadExamVersions,
  loadExamVersion,
  loadExamSnapshot,
  ExamApiError,
} from '../../lib/typing/exam-api';
import { evaluateExamAttempt } from '../../lib/typing/exam-evaluator';
import { useWorkspace } from '../providers/workspace-provider';
import { AuthBar } from '../auth/auth-bar';
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

function getOffsetTopWithin(
  element: HTMLElement,
  ancestor: HTMLElement,
): number {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && node !== ancestor) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

function splitPassageForHighlight(
  passageText: string,
  typedLength: number,
): { completed: string; active: string; remaining: string } {
  const clamped = Math.max(0, Math.min(typedLength, passageText.length));
  if (clamped >= passageText.length) {
    return { completed: passageText, active: '', remaining: '' };
  }
  // Find whole-word boundaries around the current cursor position
  let start = clamped;
  let end = clamped + 1;
  if (/\s/.test(passageText[clamped] ?? '')) {
    while (end < passageText.length && /\s/.test(passageText[end] ?? '')) {
      end++;
    }
    while (end < passageText.length && !/\s/.test(passageText[end] ?? '')) {
      end++;
    }
  } else {
    while (start > 0 && !/\s/.test(passageText[start - 1] ?? '')) {
      start--;
    }
    while (end < passageText.length && !/\s/.test(passageText[end] ?? '')) {
      end++;
    }
  }
  return {
    completed: passageText.slice(0, start),
    active: passageText.slice(start, end),
    remaining: passageText.slice(end),
  };
}

export function ExamMode() {
  const { accountId, sessionChecked } = useWorkspace();
  const [authGateEnabled, setAuthGateEnabled] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
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
  const [passages, setPassages] = useState<ExamPassageSummary[]>([]);
  const [selectedPassageId, setSelectedPassageId] = useState('');
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
  const requiresSignInRef = useRef(false);
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
  const cacheRef = useRef<{
    versionsByExam: Map<
      string,
      { items: ExamVersionSummary[]; nextCursor: string | null }
    >;
    detailByVersion: Map<string, ExamVersionDetail>;
    passagesByVersion: Map<string, ExamPassageSummary[]>;
    snapshotByKey: Map<string, ExamStartSnapshot>;
  }>({
    versionsByExam: new Map(),
    detailByVersion: new Map(),
    passagesByVersion: new Map(),
    snapshotByKey: new Map(),
  });

  const commitSession = useCallback((next: ExamSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (!isComposingRef.current || !next || next.phase === 'finished')
      setLocalText(next?.text ?? '');
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/get-session', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) {
          setAuthGateEnabled(true);
          return;
        }
        const data: unknown = await res.json().catch(() => null);
        if (!active) return;
        if (
          typeof data === 'object' &&
          data !== null &&
          'enabled' in data &&
          (data as { enabled?: unknown }).enabled === false
        ) {
          setAuthGateEnabled(false);
        } else {
          setAuthGateEnabled(true);
        }
      })
      .catch(() => {
        if (active) setAuthGateEnabled(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const requiresSignIn =
    authGateEnabled && sessionChecked && accountId === null;
  useEffect(() => {
    requiresSignInRef.current = requiresSignIn;
  }, [requiresSignIn]);

  const passageContainerRef = useRef<HTMLDivElement | null>(null);
  const passageCursorRef = useRef<HTMLSpanElement | null>(null);
  const lastPassageLineTopRef = useRef<number | null>(null);

  useEffect(() => {
    const container = passageContainerRef.current;
    const cursor = passageCursorRef.current;
    if (!container || !cursor) return;

    const lineHeight =
      Number.parseFloat(getComputedStyle(container).lineHeight) || 26;
    const lineTop = getOffsetTopWithin(cursor, container);
    if (
      lastPassageLineTopRef.current !== null &&
      Math.abs(lineTop - lastPassageLineTopRef.current) < lineHeight * 0.5
    ) {
      return;
    }
    lastPassageLineTopRef.current = lineTop;

    const targetTop = Math.max(0, lineTop - lineHeight * 1.15);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
      container.scrollTop = targetTop;
    }
  }, [localText.length, snapshot?.passage.text, fontSize]);

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
    if (!cursor) {
      const cached = cacheRef.current.versionsByExam.get(examId);
      if (cached) {
        setVersions(cached.items);
        setVersionsNextCursor(cached.nextCursor);
        setIsLoadingVersions(false);
        setIsLoadingMoreVersions(false);
        setErrorMessage(null);
        return;
      }
    }
    const controller = new AbortController();
    versionsAbortRef.current = controller;
    if (cursor) setIsLoadingMoreVersions(true);
    else setIsLoadingVersions(true);
    setErrorMessage(null);
    try {
      const page = await loadExamVersions(examId, controller.signal, cursor);
      if (controller.signal.aborted) return;
      if (!cursor) {
        cacheRef.current.versionsByExam.set(examId, {
          items: page.items,
          nextCursor: page.nextCursor,
        });
      }
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

  const loadPassageForVersion = useCallback(
    async (targetVersion: ExamVersionDetail, passageIdOverride?: string) => {
      if (
        !targetVersion.readiness.canStart ||
        (sessionRef.current && sessionRef.current.phase !== 'ready')
      )
        return;
      const targetPassageId =
        passageIdOverride !== undefined ? passageIdOverride : selectedPassageId;
      if (targetPassageId) {
        const cachedSnapshot = cacheRef.current.snapshotByKey.get(
          `${targetVersion.id}:${targetPassageId}`,
        );
        if (cachedSnapshot) {
          snapshotAbortRef.current?.abort();
          setIsLoadingSnapshot(false);
          setErrorMessage(null);
          setSnapshot(cachedSnapshot);
          setVersionDetail(cachedSnapshot.version);
          commitSession(createExamSession(cachedSnapshot));
          return;
        }
      }
      snapshotAbortRef.current?.abort();
      const controller = new AbortController();
      snapshotAbortRef.current = controller;
      setIsLoadingSnapshot(true);
      setErrorMessage(null);
      try {
        const loaded = await loadExamSnapshot(
          targetVersion.id,
          controller.signal,
          targetPassageId || undefined,
        );
        if (controller.signal.aborted) return;
        cacheRef.current.snapshotByKey.set(
          `${targetVersion.id}:${loaded.passage.id}`,
          loaded,
        );
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
    },
    [selectedPassageId, commitSession],
  );

  useEffect(() => {
    if (!selectedVersionId || sessionRef.current) return;
    const cachedDetail =
      cacheRef.current.detailByVersion.get(selectedVersionId);
    const cachedPassages =
      cacheRef.current.passagesByVersion.get(selectedVersionId);
    if (cachedDetail && cachedPassages) {
      setVersionDetail(cachedDetail);
      setPassages(cachedPassages);
      setIsLoadingVersionDetail(false);
      setErrorMessage(null);
      if (cachedDetail.readiness.canStart && cachedPassages.length > 0) {
        void loadPassageForVersion(cachedDetail, '');
      }
      return;
    }
    const controller = new AbortController();
    setIsLoadingVersionDetail(true);
    setErrorMessage(null);
    Promise.all([
      loadExamVersion(selectedVersionId, controller.signal),
      loadExamPassages(selectedVersionId, controller.signal).catch(() => []),
    ])
      .then(([detail, passageList]) => {
        if (!controller.signal.aborted) {
          cacheRef.current.detailByVersion.set(selectedVersionId, detail);
          cacheRef.current.passagesByVersion.set(
            selectedVersionId,
            passageList,
          );
          setVersionDetail(detail);
          setPassages(passageList);
          if (detail.readiness.canStart && passageList.length > 0) {
            void loadPassageForVersion(detail, '');
          }
        }
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
  }, [selectedVersionId, retry, loadPassageForVersion]);

  const loadPassage = async (passageIdOverride?: string) => {
    if (!versionDetail) return;
    await loadPassageForVersion(versionDetail, passageIdOverride);
  };
  useEffect(() => () => snapshotAbortRef.current?.abort(), []);

  const clearSelection = () => {
    snapshotAbortRef.current?.abort();
    setIsLoadingSnapshot(false);
    setIsLoadingVersionDetail(false);
    setVersionDetail(null);
    setPassages([]);
    setSelectedPassageId('');
    setSelectedVersionId('');
    setSnapshot(null);
    lastPassageLineTopRef.current = null;
    if (passageContainerRef.current) passageContainerRef.current.scrollTop = 0;
    commitSession(null);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const beforeInput = (event: InputEvent) => {
      const current = sessionRef.current;
      if (!current || requiresSignInRef.current) {
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
    if (!current || requiresSignInRef.current) return;
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
    lastPassageLineTopRef.current = null;
    if (passageContainerRef.current) passageContainerRef.current.scrollTop = 0;
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
  const isSessionActive =
    (session !== null &&
      (session.phase !== 'ready' || passages.length === 0)) ||
    isLoadingSnapshot;
  const isPassageSelectLocked =
    (session !== null && session.phase !== 'ready') ||
    isLoadingVersionDetail ||
    isLoadingSnapshot;
  const passageLength = snapshot?.passage.text.length ?? 0;
  const typedLength = session?.text.length ?? 0;
  const remainingStrokes = Math.max(0, passageLength - typedLength);
  const wordCount = countWords(session?.text ?? '');
  const configuredDurationSecs =
    session?.remainingSeconds ?? versionDetail?.rules.durationSeconds ?? null;
  const remainingSecs = configuredDurationSecs ?? 600;
  const highlightedPassage = snapshot?.passage.text
    ? splitPassageForHighlight(snapshot.passage.text, localText.length)
    : null;

  // Unified exam evaluation (Full Mistakes = 1.0, Half Mistakes = 0.5, Category Cutoffs)
  const durationProfileSecs = versionDetail?.rules.durationSeconds ?? 600;
  const elapsedSecs = Math.max(0, durationProfileSecs - remainingSecs);
  const selectedExamSlug =
    exams.find((ex) => ex.id === selectedExamId)?.slug ?? null;
  const evaluation = evaluateExamAttempt({
    masterText: snapshot?.passage.text ?? '',
    typedText: session?.text ?? '',
    elapsedSeconds: elapsedSecs,
    examSlug: selectedExamSlug,
    rules: versionDetail?.rules ?? null,
  });

  return (
    <div
      className={`${
        styles.examLayout
      } ${fontSize === 'small' ? styles.fontSizeSmall : fontSize === 'large' ? styles.fontSizeLarge : styles.fontSizeNormal}`}
      data-typing-exam-viewport="true"
    >
      {/* Top Consolidated Exam HUD Toolbar */}
      <section className={styles.hudSection}>
        <div className={styles.hudContainer}>
          {/* Upper HUD Row: Exam Badge, Selectors, Instructions Trigger & Master Timer */}
          <div className={styles.hudUpperRow}>
            <div className={styles.headerLeft}>
              <div className={styles.brandBadge}>
                <span className={styles.brandPulse} aria-hidden="true" />
                Official Exam
              </div>
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
                    isSessionActive ||
                    isLoadingVersions ||
                    versions.length === 0
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

                {passages.length > 0 && (
                  <>
                    <label htmlFor="passage-select" className={styles.srOnly}>
                      Passage
                    </label>
                    <select
                      id="passage-select"
                      className={styles.selectControl}
                      value={selectedPassageId}
                      disabled={isPassageSelectLocked}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedPassageId(nextId);
                        if (versionDetail?.readiness.canStart) {
                          void loadPassageForVersion(versionDetail, nextId);
                        }
                      }}
                    >
                      <option value="">
                        Random passage ({passages.length} available)
                      </option>
                      {passages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} (
                          {p.sourceKind === 'OFFICIAL_PREVIOUS_YEAR'
                            ? 'Previous Year'
                            : p.sourceKind === 'RECONSTRUCTED'
                              ? 'Reconstructed'
                              : 'Practice'}
                          )
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>

            <div className={styles.headerRight}>
              <span className={styles.headerSub}>
                {versionDetail
                  ? `${versionDetail.rules.durationSeconds ?? 'Unspecified'}s · ${versionDetail.rules.targetWpm ?? 'Standard'} WPM target`
                  : 'Select an exam version to inspect rules'}
              </span>

              {/* Digital High-Contrast Precision Timer */}
              <div
                className={`${
                  styles.timer
                } ${configuredDurationSecs === null ? styles.timerIdle : remainingSecs <= 60 ? styles.timerCritical : remainingSecs <= 120 ? styles.timerWarning : styles.timerSafe}`}
              >
                <div className={styles.timerMetaCol}>
                  <span className={styles.timerLabel}>Time Left</span>
                  <span className={styles.timerSubStatus}>
                    {session?.phase === 'running'
                      ? 'Active Session'
                      : session?.phase === 'finished'
                        ? 'Ended'
                        : configuredDurationSecs !== null
                          ? 'Ready'
                          : 'Select Exam'}
                  </span>
                </div>
                <span className={styles.timerDivider} aria-hidden="true" />
                <span
                  className={styles.timerDigits}
                  aria-label="Time remaining"
                  aria-live="off"
                >
                  {configuredDurationSecs !== null
                    ? formatRemainingTime(configuredDurationSecs)
                    : '--:--'}
                </span>
              </div>
            </div>
          </div>

          {/* Lower HUD Parameter Ribbon: Scale, Backspace Protocol & Real-time Telemetry */}
          <nav
            className={styles.toolbar}
            aria-label="Controls and Counters Bar"
          >
            <div className={styles.toolbarSection}>
              {/* Font Zoom Controls */}
              <div className={styles.zoomControls}>
                <span className={styles.toolbarLabel}>Scale</span>
                <div className={styles.zoomPillGroup}>
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
              </div>

              {/* Backspace Constraint Pill */}
              <div className={styles.rulePill}>
                <span className={styles.ruleDot} />
                <span>
                  Rule:{' '}
                  <strong>
                    Backspace:{' '}
                    {versionDetail?.rules.backspacePolicy ?? 'Unspecified'}
                  </strong>
                </span>
              </div>

              <span className={styles.passageTitlePill}>
                <span className={styles.toolbarLabel}>Passage:</span>
                <strong>
                  {snapshot?.passage.title ?? 'No passage selected'}
                </strong>
              </span>
            </div>

            {/* Telemetry Stroke / Character Counter Matrix */}
            <div className={styles.telemetryMatrix}>
              <div className={styles.statPill}>
                <span>Total Strokes:</span>
                <strong className={styles.statValue}>
                  {passageLength.toLocaleString()}
                </strong>
              </div>
              <span className={styles.statDivider} aria-hidden="true" />
              <div className={styles.statPill}>
                <span>Typed:</span>
                <strong className={`${styles.statValue} ${styles.statTyped}`}>
                  {typedLength.toLocaleString()}
                </strong>
              </div>
              <span className={styles.statDivider} aria-hidden="true" />
              <div className={styles.statPill}>
                <span>Remaining:</span>
                <strong
                  className={`${styles.statValue} ${styles.statRemaining}`}
                >
                  {remainingStrokes.toLocaleString()}
                </strong>
              </div>
              <span className={styles.statDivider} aria-hidden="true" />
              <div className={styles.statPill}>
                <span>Words:</span>
                <strong className={styles.statValue}>
                  {wordCount.toLocaleString()}
                </strong>
              </div>
            </div>
          </nav>

          {/* Compact Instructions & Session Launch Strip */}
          {versionDetail && (
            <section
              className={styles.instructionsBar}
              aria-label="Exam instructions"
            >
              <details className={styles.instructionsDetails}>
                <summary className={styles.instructionsSummary}>
                  Instructions and passage source
                </summary>
                <div className={styles.instructionsBody}>
                  <strong>{versionDetail.label}</strong>
                  <p>
                    {versionDetail.rules.instructions ??
                      'Read the passage and type it in the answer field.'}
                  </p>
                  <p>
                    Typing starts the clock. Corrections are allowed in the
                    supported simulation. Paste and drop are blocked.
                    Confirmation does not pause the clock. Official scoring is
                    unavailable.
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
                </div>
              </details>
              <div className={styles.instructionsAction}>
                {!session && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => void loadPassage()}
                    disabled={
                      !versionDetail.readiness.canStart || isLoadingSnapshot
                    }
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
              </div>
            </section>
          )}
        </div>
      </section>

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

      {isLoadingExams && (
        <p className={styles.statusNotice} role="status">
          Loading exams...
        </p>
      )}
      {!isLoadingExams && !errorMessage && exams.length === 0 && (
        <p className={styles.statusNotice} role="status">
          No published exams are available.
        </p>
      )}
      {selectedExamId && !isLoadingVersions && versions.length === 0 && (
        <p className={styles.statusNotice} role="status">
          No published versions are available.
        </p>
      )}

      {/* Dual-Pane Viewport-Locked Split Workspace (Strict internal auto-scroll only) */}
      <div className={styles.splitScreen}>
        {/* PANE 1: Official Master Passage (Top Half) */}
        <section className={styles.panel} aria-labelledby="passage-heading">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderLeft}>
              <span className={styles.panelIcon} aria-hidden="true">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </span>
              <h2 id="passage-heading" className={styles.panelTitle}>
                Official Master Passage
              </h2>
              <span className={styles.panelBadge}>
                Read-only Examination Script
              </span>
            </div>
            <div className={styles.panelHeaderRight}>
              <span className={styles.syncBadge}>
                <span className={styles.syncDot} aria-hidden="true" />
                Auto-scrolls synchronously
              </span>
              {versionDetail?.rules.targetWpm && (
                <span className={styles.targetSpeedPill}>
                  Target: {versionDetail.rules.targetWpm} WPM
                </span>
              )}
            </div>
          </div>
          <div ref={passageContainerRef} className={styles.passageContent}>
            {isLoadingVersionDetail || isLoadingSnapshot ? (
              <p className={styles.passagePlaceholder}>
                Loading master passage...
              </p>
            ) : highlightedPassage ? (
              <>
                <span className={styles.passageCompleted}>
                  {highlightedPassage.completed}
                </span>
                <span
                  ref={passageCursorRef}
                  className={styles.passageActiveWord}
                >
                  {highlightedPassage.active}
                </span>
                <span className={styles.passageRemaining}>
                  {highlightedPassage.remaining}
                </span>
              </>
            ) : (
              <span className={styles.passagePlaceholder}>
                Select a ready exam version to load passage.
              </span>
            )}
          </div>
        </section>

        {/* PANE 2: Candidate Real-time Interactive Typing Console (Bottom Half) */}
        <section
          className={`${styles.panel} ${styles.inputPanel}`}
          aria-labelledby="input-heading"
        >
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderLeft}>
              <span
                className={`${styles.panelIcon} ${styles.panelIconConsole}`}
                aria-hidden="true"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
                </svg>
              </span>
              <h2 id="input-heading" className={styles.panelTitle}>
                Candidate Input Console
              </h2>
              <span
                className={`${styles.sessionStatusTag} ${
                  session?.phase === 'running'
                    ? styles.sessionStatusRunning
                    : session?.phase === 'finished'
                      ? styles.sessionStatusFinished
                      : ''
                }`}
              >
                {session?.phase === 'running'
                  ? 'Session Active'
                  : session?.phase === 'finished'
                    ? 'Completed'
                    : 'Awaiting Keystroke'}
              </span>
            </div>
            <div className={styles.panelHeaderRight}>
              <span className={styles.panelHint}>
                {session?.phase === 'running'
                  ? 'Test in progress · Editing permitted'
                  : session?.phase === 'finished'
                    ? 'Test submitted / expired · Read-only'
                    : 'Clock starts automatically on first keystroke'}
              </span>
              <span className={styles.prohibitedPill}>
                Copy-Paste Prohibited
              </span>
            </div>
          </div>
          <div className={styles.textareaWrap}>
            <textarea
              ref={textareaRef}
              id="typing-textarea"
              className={`${styles.typingTextarea} ${
                requiresSignIn ||
                (session?.phase === 'ready' &&
                  !isInputFocused &&
                  localText.length === 0)
                  ? styles.typingTextareaBlurred
                  : ''
              }`}
              placeholder="Click here and begin typing the official master passage exactly as displayed above. Your test begins immediately upon keystroke..."
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Your answer"
              disabled={!session}
              readOnly={session?.phase === 'finished' || requiresSignIn}
              value={localText}
              onChange={handleTextareaChange}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
            />
            {requiresSignIn ? (
              <div
                className={styles.authGateOverlay}
                role="region"
                aria-label="Sign in required to start examination"
              >
                <div className={styles.authGateCard}>
                  <h3 className={styles.authGateTitle}>
                    Sign in to start Exam Simulation
                  </h3>
                  <p className={styles.authGateCopy}>
                    Sign in to unlock the candidate input console and start the
                    official examination timer.
                  </p>
                  <div className={styles.authGateActions}>
                    <AuthBar presentation="signin" />
                  </div>
                </div>
              </div>
            ) : (
              session?.phase === 'ready' &&
              !isInputFocused &&
              localText.length === 0 && (
                <div className={styles.startReadyOverlay} aria-hidden="true">
                  <div className={styles.startReadyPill}>
                    <span className={styles.startReadyDot} />
                    <span>
                      Click here to start typing · Timer begins on first
                      keystroke
                    </span>
                  </div>
                </div>
              )
            )}
            <div className={styles.focusGuidePill} aria-hidden="true">
              Strict Exam Mode · Copy-Paste Prohibited
            </div>
          </div>
        </section>
      </div>

      {/* Pinned Bottom Simulation Action & Integrity Bar */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <Link href="/typing" className={styles.exitLink}>
            ← Return to Practice Mode
          </Link>
          <span className={styles.footerWarning}>
            Exiting or reloading will immediately forfeit this simulation
            attempt.
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
            <div
              className={`${styles.scoreCard} ${
                evaluation.netWpm >= evaluation.targetWpm
                  ? styles.scoreCardHero
                  : evaluation.netWpm >= 27
                    ? styles.scoreCardWarn
                    : styles.scoreCardDanger
              }`}
            >
              <span className={styles.scoreCardLabel}>Net Speed (Est.)</span>
              <strong className={styles.scoreCardVal}>
                {evaluation.netWpm} WPM
              </strong>
              <span className={styles.scoreCardSub}>
                Target benchmark: {evaluation.targetWpm} WPM
              </span>
            </div>
            <div className={`${styles.scoreCard} ${styles.scoreCardInfo}`}>
              <span className={styles.scoreCardLabel}>Gross Speed</span>
              <strong className={styles.scoreCardVal}>
                {evaluation.grossWpm} WPM
              </strong>
              <span className={styles.scoreCardSub}>Raw keystroke pace</span>
            </div>
            <div
              className={`${styles.scoreCard} ${
                evaluation.overallStatus === 'QUALIFIED_ALL'
                  ? styles.scoreCardHero
                  : evaluation.overallStatus === 'QUALIFIED_RESERVED'
                    ? styles.scoreCardWarn
                    : evaluation.accuracyPercent >= 90
                      ? styles.scoreCardWarn
                      : styles.scoreCardDanger
              }`}
            >
              <span className={styles.scoreCardLabel}>
                SSC Mistakes & Accuracy
              </span>
              <strong className={styles.scoreCardVal}>
                {evaluation.accuracyPercent}%
              </strong>
              <span className={styles.scoreCardSub}>
                {evaluation.fullMistakes} Full · {evaluation.halfMistakes} Half
                ({evaluation.errorPercent}% error)
              </span>
            </div>
            <div
              className={`${styles.scoreCard} ${
                evaluation.overallStatus === 'QUALIFIED_ALL'
                  ? styles.scoreCardHero
                  : evaluation.overallStatus === 'QUALIFIED_RESERVED'
                    ? styles.scoreCardWarn
                    : styles.scoreCardDanger
              }`}
            >
              <span className={styles.scoreCardLabel}>Evaluation Status</span>
              <strong className={styles.scoreCardVal}>
                {evaluation.statusLabel}
              </strong>
              <span className={styles.scoreCardSub}>
                {evaluation.statusDetail}
              </span>
            </div>
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
                Time taken: {elapsedSecs}s / {durationProfileSecs}s
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
