'use client';

import {
  useEffect,
  useRef,
  useState,
  type CompositionEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  loadPracticePassage,
  type PracticePassage,
} from '@/lib/typing/practice-api';
import {
  createTypingSession,
  type ActualInsertion,
  type EditRejection,
  type SessionSnapshot,
} from '@/lib/typing/session';
import { PassageView } from './passage-view';
import styles from './typing-practice.module.css';

const DURATION_PRESETS = [
  { label: '2m', seconds: 120 },
  { label: '3m', seconds: 180 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
] as const;
const DEFAULT_DURATION_SECONDS = 120;
const DEFAULT_CUSTOM_DURATION_MINUTES = 15;
const MIN_CUSTOM_DURATION_MINUTES = 1;
const MAX_CUSTOM_DURATION_MINUTES = 60;
const TICK_MS = 100;
const LIVE_STATS_MIN_ELAPSED_MS = 1000;
type PassageState =
  | { status: 'loading' }
  | { status: 'ready'; passage: PracticePassage }
  | { status: 'empty' }
  | { status: 'error' };

const REJECTION_NOTES: Record<EditRejection, string> = {
  expired: 'Time is up. Restart to run the session again.',
  paused: 'Session paused — click the typing box to resume.',
  finished: 'The session has finished. Restart to run it again.',
  unsupported:
    'That character couldn’t be added. Use English letters, numbers, or standard punctuation.',
};

export function TypingPractice() {
  const engineRef = useRef<ReturnType<typeof createTypingSession> | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createTypingSession({
      target: '',
      durationMs: DEFAULT_DURATION_SECONDS * 1000,
    });
  }
  const engine = engineRef.current;

  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() =>
    engine.snapshot(),
  );
  const [passageState, setPassageState] = useState<PassageState>({
    status: 'loading',
  });
  const [durationSeconds, setDurationSeconds] = useState(
    DEFAULT_DURATION_SECONDS,
  );
  const [customMinutes, setCustomMinutes] = useState(
    DEFAULT_CUSTOM_DURATION_MINUTES,
  );
  const [note, setNote] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [keyboardViewport, setKeyboardViewport] = useState<{
    height: number;
    top: number;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const compositionRangeRef = useRef<{ start: number; end: number } | null>(
    null,
  );
  // Native beforeinput metadata for the pending insertion, if any.
  const pendingInsertionRef = useRef<{
    text: string;
    position: number;
  } | null>(null);
  const requestRef = useRef<{ controller: AbortController; id: number } | null>(
    null,
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    const mobile = window.matchMedia(
      '(max-width: 760px) and (pointer: coarse)',
    );
    if (!isFocused || !viewport) {
      setKeyboardViewport(null);
      return;
    }

    const update = () => {
      // Ignore zoom and small changes from the browser toolbar.
      const keyboardOpen =
        mobile.matches &&
        viewport.scale === 1 &&
        window.innerHeight - viewport.height > 100;
      setKeyboardViewport(
        keyboardOpen
          ? { height: viewport.height, top: viewport.offsetTop }
          : null,
      );
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    mobile.addEventListener('change', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      mobile.removeEventListener('change', update);
    };
  }, [isFocused]);

  // Interval only refreshes the display; the deadline itself is enforced by
  // the engine before each edit and inside tick(). Strict Mode cleanup-safe.
  useEffect(() => {
    if (snapshot.status !== 'running') return;
    const session = engineRef.current;
    if (!session) return;
    const interval = setInterval(() => {
      setSnapshot(session.tick());
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [snapshot.status]);

  // Running -> paused on window blur or a hidden tab; idle also drops focus.
  useEffect(() => {
    const pauseRunning = () => {
      setIsFocused(false);
      const session = engineRef.current;
      if (!session) return;
      session.pause();
      setSnapshot(session.snapshot());
    };
    const handleVisibility = () => {
      if (document.hidden) pauseRunning();
    };
    window.addEventListener('blur', pauseRunning);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', pauseRunning);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Capture insertion intent before the DOM changes; the input event also
  // fires when a selection is replaced with identical text.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const captureInsertion = (event: InputEvent) => {
      pendingInsertionRef.current = null;
      if (
        event.inputType === 'historyUndo' ||
        event.inputType === 'historyRedo'
      ) {
        event.preventDefault();
        setNote(
          'Undo and redo are not supported in the typing field. Correct with Backspace or Delete.',
        );
        return;
      }
      if (
        compositionRangeRef.current !== null ||
        event.isComposing ||
        event.inputType.toLowerCase().includes('composition')
      ) {
        return;
      }
      if (event.inputType.startsWith('insert') && event.data) {
        pendingInsertionRef.current = {
          text: event.data,
          position: textarea.selectionStart,
        };
      }
    };
    textarea.addEventListener('beforeinput', captureInsertion);
    return () => textarea.removeEventListener('beforeinput', captureInsertion);
  }, []);

  const settingsLocked =
    snapshot.status === 'running' || snapshot.status === 'paused';

  const rejectEdit = (rejection: EditRejection) => {
    const session = engineRef.current;
    const textarea = textareaRef.current;
    if (textarea && session) {
      textarea.value = session.snapshot().typedText;
    }
    setNote(REJECTION_NOTES[rejection]);
  };

  const revertTypingField = (message: string) => {
    const session = engineRef.current;
    const textarea = textareaRef.current;
    if (textarea && session) {
      textarea.value = session.snapshot().typedText;
    }
    setNote(message);
  };

  const handleTypingInput = (event: FormEvent<HTMLTextAreaElement>) => {
    const session = engineRef.current;
    if (!session) return;
    const native = event.nativeEvent;
    const inputType =
      'inputType' in native && typeof native.inputType === 'string'
        ? native.inputType
        : '';
    const data =
      'data' in native && typeof native.data === 'string' ? native.data : null;
    const pending = pendingInsertionRef.current;
    pendingInsertionRef.current = null;
    if (inputType === 'historyUndo' || inputType === 'historyRedo') {
      revertTypingField(
        'Undo and redo are not supported in the typing field. Correct with Backspace or Delete.',
      );
      return;
    }
    if (
      compositionRangeRef.current !== null ||
      ('isComposing' in native && native.isComposing) ||
      (inputType.toLowerCase().includes('composition') &&
        event.currentTarget.value === session.snapshot().typedText)
    ) {
      return;
    }
    const insertion =
      pending ??
      (inputType.startsWith('insert') && data
        ? {
            text: data,
            position: Math.max(
              0,
              event.currentTarget.selectionStart - data.length,
            ),
          }
        : undefined);
    applyTypingEdit(event.currentTarget.value, insertion);
  };

  const applyTypingEdit = (value: string, insertion?: ActualInsertion) => {
    const session = engineRef.current;
    if (!session) return;
    const result = session.applyEdit(value, insertion);
    setSnapshot(session.snapshot());
    if (result.accepted) {
      setNote(null);
    } else if (result.rejection !== null) {
      rejectEdit(result.rejection);
    }
  };

  const handleCompositionStart = (
    event: CompositionEvent<HTMLTextAreaElement>,
  ) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    compositionRangeRef.current = { start: selectionStart, end: selectionEnd };
    pendingInsertionRef.current = null;
  };

  const handleCompositionEnd = (
    event: CompositionEvent<HTMLTextAreaElement>,
  ) => {
    const range = compositionRangeRef.current;
    compositionRangeRef.current = null;
    pendingInsertionRef.current = null;
    const session = engineRef.current;
    if (!session) return;
    const textarea = event.currentTarget;
    const { typedText } = session.snapshot();
    if (range === null || !event.data) {
      if (textarea.value !== typedText) textarea.value = typedText;
      return;
    }
    // Supply insertion metadata only when it describes the final DOM edit.
    const expected =
      typedText.slice(0, range.start) + event.data + typedText.slice(range.end);
    if (textarea.value === expected) {
      applyTypingEdit(textarea.value, {
        text: event.data,
        position: range.start,
      });
    } else if (textarea.value !== typedText) {
      applyTypingEdit(textarea.value);
    }
  };

  const handleTypingKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (compositionRangeRef.current !== null) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    const modifierHeld = event.ctrlKey || event.metaKey;
    if (
      modifierHeld &&
      (event.key === 'z' ||
        event.key === 'Z' ||
        event.key === 'y' ||
        event.key === 'Y')
    ) {
      // Undo/redo rewrites text outside the attempt history; keep the log honest.
      event.preventDefault();
      setNote(
        'Undo and redo are not supported in the typing field. Correct with Backspace or Delete.',
      );
    }
  };

  const handleTypingFocus = () => {
    setIsFocused(true);
    const session = engineRef.current;
    if (!session) return;
    if (session.snapshot().status === 'paused') {
      session.resume();
      setNote(null);
      setSnapshot(session.snapshot());
    }
  };

  const handleTypingPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setNote(
      'Pasting into the typing field is not scored. Type the passage instead.',
    );
  };

  const handleTypingDrop = (event: DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setNote(
      'Dropping text into the typing field is not scored. Type the passage instead.',
    );
  };

  const handleTypingBlur = () => {
    setIsFocused(false);
    const session = engineRef.current;
    if (!session) return;
    session.pause();
    setSnapshot(session.snapshot());
  };

  const handleResume = () => {
    const session = engineRef.current;
    if (!session) return;
    session.resume();
    setSnapshot(session.snapshot());
    textareaRef.current?.focus();
    setIsFocused(true);
  };

  const handleFocusOverlayActivate = () => {
    if (snapshot.status === 'paused') {
      handleResume();
    } else {
      textareaRef.current?.focus();
      setIsFocused(true);
    }
  };

  // Every fresh session goes through here so composition state, pending
  // insertion metadata and the field content cannot leak across restarts.
  const restartSession = (settings?: {
    target?: string;
    durationMs?: number;
  }) => {
    const session = engineRef.current;
    if (!session) return;
    session.restart(settings);
    compositionRangeRef.current = null;
    pendingInsertionRef.current = null;
    const textarea = textareaRef.current;
    if (textarea) textarea.value = '';
    setNote(null);
    setSnapshot(session.snapshot());
  };

  const handleRestart = () => {
    restartSession();
    textareaRef.current?.focus();
    setIsFocused(true);
  };

  const loadPassage = () => {
    requestRef.current?.controller.abort();
    const request = {
      controller: new AbortController(),
      id: (requestRef.current?.id ?? 0) + 1,
    };
    requestRef.current = request;
    restartSession({ target: '' });
    setPassageState({ status: 'loading' });
    void loadPracticePassage(request.controller.signal)
      .then((passage) => {
        if (
          request.controller.signal.aborted ||
          requestRef.current?.id !== request.id
        )
          return;
        if (passage === null) {
          setPassageState({ status: 'empty' });
          return;
        }
        restartSession({ target: passage.text });
        setPassageState({ status: 'ready', passage });
      })
      .catch(() => {
        if (
          request.controller.signal.aborted ||
          requestRef.current?.id !== request.id
        ) {
          return;
        }
        setPassageState({ status: 'error' });
      });
  };

  useEffect(() => {
    loadPassage();
    return () => requestRef.current?.controller.abort();
  }, []);

  useEffect(() => {
    if (passageState.status === 'ready') {
      textareaRef.current?.focus();
    }
  }, [passageState]);

  const applyDuration = (seconds: number) => {
    restartSession({ durationMs: seconds * 1000 });
    setDurationSeconds(seconds);
    textareaRef.current?.focus();
    setIsFocused(true);
  };

  const showLiveStats =
    snapshot.elapsedMs !== null &&
    snapshot.elapsedMs >= LIVE_STATS_MIN_ELAPSED_MS;

  const statusMessage =
    snapshot.status === 'idle'
      ? 'Timer begins automatically on first keystroke'
      : snapshot.status === 'paused'
        ? 'Session paused — click below to resume'
        : null;

  const loading = passageState.status === 'loading';
  const showBlurOverlay =
    passageState.status === 'ready' &&
    snapshot.status !== 'finished' &&
    (snapshot.status === 'paused' ||
      (snapshot.status === 'idle' && !isFocused));
  const isPresetSelected = DURATION_PRESETS.some(
    (preset) => preset.seconds === durationSeconds,
  );
  const wordCount = snapshot.target
    ? snapshot.target.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const charCount = snapshot.target.length;

  return (
    <div
      className={
        keyboardViewport
          ? `${styles.root} ${styles.keyboardLayout}`
          : styles.root
      }
      style={keyboardViewport ?? undefined}
    >
      {/* Upper Control & HUD Strip (Single Line) */}
      <div className={styles.controlHudStrip}>
        <div className={styles.controlHudInner}>
          {/* Left: Next / Restart Buttons */}
          <div className={styles.metaCluster}>
            <div className={styles.actions}>
              {passageState.status === 'loading' && (
                <span className={styles.loadingTag} role="status">
                  Loading passage…
                </span>
              )}
              {passageState.status === 'empty' && (
                <span className={styles.errorInline} role="status">
                  No passages available.
                </span>
              )}
              {passageState.status === 'error' && (
                <span className={styles.errorInline} role="alert">
                  Passages unavailable.
                </span>
              )}
              {(passageState.status === 'empty' ||
                passageState.status === 'error') && (
                <button
                  type="button"
                  className={styles.hudBtn}
                  onClick={loadPassage}
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                className={styles.hudBtn}
                onPointerDown={(event) => event.preventDefault()}
                onClick={loadPassage}
                disabled={loading || passageState.status !== 'ready'}
                title="Load next passage"
              >
                <svg
                  className={styles.hudIcon}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>Next passage</span>
              </button>
              <button
                type="button"
                className={styles.hudBtn}
                onPointerDown={(event) => event.preventDefault()}
                onClick={handleRestart}
                disabled={loading || passageState.status !== 'ready'}
                title="Reset test"
              >
                <svg
                  className={styles.hudIcon}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>Restart</span>
              </button>
            </div>
          </div>

          {/* Center: Segmented Duration Controller (Minutes + Stepper) */}
          <fieldset
            className={styles.durationSegment}
            disabled={settingsLocked || loading}
            aria-label="Session duration"
          >
            <legend className={styles.legend}>Duration</legend>
            <span className={styles.durationTag} aria-hidden="true">
              Duration
            </span>
            <div className={styles.presetPillGroup}>
              {DURATION_PRESETS.map((preset) => {
                const active = durationSeconds === preset.seconds;
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    className={`${styles.segBtn}${active ? ` ${styles.segBtnActive}` : ''}`}
                    aria-pressed={active}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => applyDuration(preset.seconds)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className={styles.segDivider} aria-hidden="true" />
            <div className={styles.stepperGroup}>
              <button
                type="button"
                className={styles.stepperBtn}
                title="Decrease minutes"
                aria-label="Decrease custom minutes"
                disabled={customMinutes <= MIN_CUSTOM_DURATION_MINUTES}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() =>
                  setCustomMinutes((prev) =>
                    Math.max(MIN_CUSTOM_DURATION_MINUTES, prev - 1),
                  )
                }
              >
                -
              </button>
              <span
                className={`${styles.customVal}${!isPresetSelected ? ` ${styles.customValActive}` : ''}`}
                aria-live="polite"
              >
                {customMinutes}m
              </span>
              <button
                type="button"
                className={styles.stepperBtn}
                title="Increase minutes"
                aria-label="Increase custom minutes"
                disabled={customMinutes >= MAX_CUSTOM_DURATION_MINUTES}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() =>
                  setCustomMinutes((prev) =>
                    Math.min(MAX_CUSTOM_DURATION_MINUTES, prev + 1),
                  )
                }
              >
                +
              </button>
              <button
                type="button"
                className={styles.setBtn}
                title="Set custom duration"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => applyDuration(customMinutes * 60)}
              >
                Set
              </button>
            </div>
          </fieldset>

          {/* Right: Real-time Live HUD Metrics */}
          <dl className={styles.stats} aria-label="Live statistics">
            <div className={styles.stat}>
              <dt>Time</dt>
              <dd className={styles.statTime}>
                {formatRemainingTime(snapshot.remainingMs)}
              </dd>
            </div>
            <div className={styles.statDivider} aria-hidden="true" />
            <div className={styles.stat}>
              <dt>Net WPM</dt>
              <dd>
                {showLiveStats ? formatSpeed(snapshot.score.netWpm) : '—'}
              </dd>
            </div>
            <div className={styles.statDivider} aria-hidden="true" />
            <div className={styles.stat}>
              <dt>Accuracy</dt>
              <dd className={styles.statAccuracy}>
                {showLiveStats ? formatPercent(snapshot.score.accuracy) : '—'}
              </dd>
            </div>
            <div className={styles.statDivider} aria-hidden="true" />
            <div className={styles.stat}>
              <dt>Errors</dt>
              <dd className={styles.statErrors}>
                {snapshot.incorrectAttempts}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Main Non-Scrolling Workspace */}
      <div className={styles.workspace}>
        {/* Upper Block: Scrollable Passage Card */}
        <div
          className={`${styles.passageCard}${showBlurOverlay ? ` ${styles.passageCardBlurred}` : ''}`}
          onClick={() => {
            if (showBlurOverlay) {
              handleFocusOverlayActivate();
            }
          }}
        >
          <div className={styles.passageHeader}>
            <div className={styles.passageHeaderLeft}>
              <span className={styles.pulseDot} aria-hidden="true" />
              <span className={styles.viewerLabel}>Exam Passage Viewer</span>
              <span className={styles.viewerSep} aria-hidden="true">
                •
              </span>
              <span className={styles.viewerSub}>Original Text Stream</span>
            </div>
            <div className={styles.passageHeaderRight}>
              <span>
                Words: <strong>{wordCount}</strong>
              </span>
              <span className={styles.viewerSub}>
                Chars: <strong>{charCount}</strong>
              </span>
            </div>
          </div>

          <PassageView
            target={snapshot.target}
            typedText={snapshot.typedText}
            keyboardHeight={keyboardViewport?.height}
          />

          {snapshot.status === 'finished' &&
            (() => {
              const netWpm = snapshot.score.netWpm ?? 0;
              const accuracy = snapshot.score.accuracy ?? 0;
              const speedTier: 'Good' | 'Warn' | 'Bad' =
                netWpm >= 35 ? 'Good' : netWpm >= 27 ? 'Warn' : 'Bad';
              const accuracyTier: 'Good' | 'Warn' | 'Bad' =
                accuracy >= 95 ? 'Good' : accuracy >= 90 ? 'Warn' : 'Bad';
              const speedHint =
                speedTier === 'Good'
                  ? '35+ target met'
                  : speedTier === 'Warn'
                    ? '27+ avg pace'
                    : 'Below 27 WPM';
              const accuracyHint =
                accuracyTier === 'Good'
                  ? 'Clean typing'
                  : accuracyTier === 'Warn'
                    ? 'Watch typos'
                    : 'Needs work';
              const coachingText =
                speedTier === 'Bad' && accuracyTier === 'Bad'
                  ? 'Needs work: slow down to reduce errors, then build past 27 WPM'
                  : speedTier === 'Bad'
                    ? 'Speed needs work: build steady rhythm toward 27+ WPM'
                    : accuracyTier === 'Bad'
                      ? 'Accuracy needs work: cut typos to raise your Net WPM'
                      : speedTier === 'Warn' || accuracyTier === 'Warn'
                        ? 'Good average pace: push toward 35 WPM & 95%+ accuracy'
                        : 'Strong session: 35+ WPM with high accuracy';
              const coachingBadgeClass =
                speedTier === 'Bad' || accuracyTier === 'Bad'
                  ? styles.summaryBadgeBad
                  : speedTier === 'Warn' || accuracyTier === 'Warn'
                    ? styles.summaryBadgeWarn
                    : styles.summaryBadgeGood;

              return (
                <section
                  className={styles.summary}
                  aria-label="Session summary"
                >
                  <div className={styles.summaryHeader}>
                    <div className={styles.summaryTitleGroup}>
                      <h2>
                        Session summary —{' '}
                        {snapshot.finishedReason === 'target'
                          ? 'Passage completed'
                          : 'Time is up'}
                      </h2>
                      <span
                        className={`${styles.summaryCoachingBadge} ${coachingBadgeClass}`}
                      >
                        {coachingText}
                      </span>
                    </div>
                    <span className={`muted ${styles.disclaimer}`}>
                      Practice estimate only — not an official qualification
                      result.
                    </span>
                  </div>
                  <dl className={styles.summaryGrid}>
                    <div
                      className={
                        speedTier === 'Good'
                          ? styles.summaryCardGood
                          : speedTier === 'Warn'
                            ? styles.summaryCardWarn
                            : styles.summaryCardBad
                      }
                    >
                      <dt>
                        <span>Net speed</span>
                        <span className={styles.summaryHintTag}>
                          {speedHint}
                        </span>
                      </dt>
                      <dd
                        className={
                          speedTier === 'Good'
                            ? styles.summaryValGood
                            : speedTier === 'Warn'
                              ? styles.summaryValWarn
                              : styles.summaryValBad
                        }
                      >
                        {formatSpeed(snapshot.score.netWpm)} WPM
                      </dd>
                    </div>
                    <div className={styles.summaryCardInfo}>
                      <dt>
                        <span>Gross speed</span>
                        <span className={styles.summaryHintTag}>Raw pace</span>
                      </dt>
                      <dd className={styles.summaryValInfo}>
                        {formatSpeed(snapshot.score.grossWpm)} WPM
                      </dd>
                    </div>
                    <div
                      className={
                        accuracyTier === 'Good'
                          ? styles.summaryCardGood
                          : accuracyTier === 'Warn'
                            ? styles.summaryCardWarn
                            : styles.summaryCardBad
                      }
                    >
                      <dt>
                        <span>Accuracy</span>
                        <span className={styles.summaryHintTag}>
                          {accuracyHint}
                        </span>
                      </dt>
                      <dd
                        className={
                          accuracyTier === 'Good'
                            ? styles.summaryValGood
                            : accuracyTier === 'Warn'
                              ? styles.summaryValWarn
                              : styles.summaryValBad
                        }
                      >
                        {formatPercent(snapshot.score.accuracy)}
                      </dd>
                    </div>
                    <div>
                      <dt>Active time</dt>
                      <dd className={styles.summaryValNeutral}>
                        {snapshot.elapsedMs === null
                          ? '—'
                          : `${Math.round(snapshot.elapsedMs / 1000)}s`}
                      </dd>
                    </div>
                    <div
                      className={
                        snapshot.incorrectAttempts > 10
                          ? styles.summaryCardBad
                          : snapshot.incorrectAttempts > 0
                            ? styles.summaryCardWarn
                            : styles.summaryCardGood
                      }
                    >
                      <dt>Keystrokes</dt>
                      <dd className={styles.summaryKeystrokes}>
                        <span className={styles.summaryValGood}>
                          {snapshot.correctAttempts} correct
                        </span>
                        <span className={styles.summarySlash}> / </span>
                        <span
                          className={
                            snapshot.incorrectAttempts > 10
                              ? styles.summaryValBad
                              : snapshot.incorrectAttempts > 0
                                ? styles.summaryValWarn
                                : styles.summaryValGood
                          }
                        >
                          {snapshot.incorrectAttempts} incorrect
                        </span>
                      </dd>
                    </div>
                  </dl>
                </section>
              );
            })()}
        </div>

        {/* Lower Block: Pinned Compact Typing Input Console */}
        <div
          className={styles.inputCard}
          onClick={() => {
            if (showBlurOverlay) {
              handleFocusOverlayActivate();
            }
          }}
        >
          <div className={styles.typingFieldWrap}>
            <div
              className={`${styles.typingBlurTarget}${showBlurOverlay ? ` ${styles.typingBlurred}` : ''}`}
            >
              <label className={styles.typingLabel}>
                Type the passage here
                <textarea
                  ref={textareaRef}
                  className={styles.typingInput}
                  rows={3}
                  placeholder="Start typing the passage here... (Timer starts automatically on first keypress)"
                  onInput={handleTypingInput}
                  onFocus={handleTypingFocus}
                  onBlur={handleTypingBlur}
                  onKeyDown={handleTypingKeyDown}
                  onPaste={handleTypingPaste}
                  onDrop={handleTypingDrop}
                  onDragOver={(event) => event.preventDefault()}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  disabled={passageState.status !== 'ready'}
                />
              </label>
            </div>

            {showBlurOverlay && (
              <button
                type="button"
                className={styles.focusOverlay}
                onClick={(event) => {
                  event.stopPropagation();
                  handleFocusOverlayActivate();
                }}
              >
                <span className={styles.focusOverlayPill}>
                  {snapshot.status === 'paused' ? (
                    <svg
                      className={styles.focusOverlayIcon}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 5.14v14l11-7-11-7z" />
                    </svg>
                  ) : (
                    <svg
                      className={styles.focusOverlayIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
                    </svg>
                  )}
                  <span>
                    {snapshot.status === 'paused'
                      ? 'Session paused — Click here to resume'
                      : 'Click here to start typing'}
                  </span>
                </span>
              </button>
            )}
          </div>

          <div className={note ? undefined : styles.inputHeader}>
            <p className={note ? styles.note : styles.statusLine} role="status">
              {note ??
                statusMessage ??
                (snapshot.status === 'finished'
                  ? snapshot.finishedReason === 'target'
                    ? 'Passage completed — press Restart or Next passage.'
                    : 'Time is up — press Restart or Next passage.'
                  : '')}
            </p>
          </div>

          <div className={styles.consoleFooter}>
            <div className={styles.shortcutList}>
              <span className={styles.shortcutItem}>
                <kbd className={styles.kbd}>Click box</kbd>
                <span>Resume when paused</span>
              </span>
              <span className={styles.viewerSep} aria-hidden="true">
                •
              </span>
              <span className={styles.shortcutItem}>
                <kbd className={styles.kbd}>Esc</kbd>
                <span>Pause test</span>
              </span>
            </div>
            <div className={styles.consoleStatusRight}>
              <span className={styles.liveBadge}>
                <span className={styles.readyDot} aria-hidden="true" />
                Live Keystroke Detection Active
              </span>
              <span className={styles.viewerSep} aria-hidden="true">
                |
              </span>
              <span className={styles.viewerSub}>Client-side Isolated</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) {
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
  return `${totalSeconds}s`;
}

function formatSpeed(value: number | null): string {
  return value === null ? '—' : String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
