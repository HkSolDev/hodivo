'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CompositionEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  MAX_CUSTOM_DURATION_SECONDS,
  MAX_CUSTOM_PASSAGE_LENGTH,
  MIN_CUSTOM_DURATION_SECONDS,
  parseCustomDuration,
  validateCustomPassage,
} from '@/lib/typing/custom-input';
import {
  createTypingSession,
  type EditRejection,
  type SessionSnapshot,
} from '@/lib/typing/session';
import {
  getRandomWords,
  INITIAL_WORDS_PASSAGE,
  WORDS_PER_SESSION,
} from '@/lib/typing/words';
import { PassageView } from './passage-view';
import styles from './typing-practice.module.css';

const DURATION_PRESETS = [15, 30, 60] as const;
const DEFAULT_DURATION_SECONDS = 15;
const TICK_MS = 100;
const LIVE_STATS_MIN_ELAPSED_MS = 1000;
type PassageMode = 'words' | 'custom';

const PASSAGE_ERRORS: Record<
  'unsupported-characters' | 'empty' | 'too-long',
  string
> = {
  'unsupported-characters':
    'Use English letters, digits, punctuation and whitespace only. The passage was rejected, not scored.',
  empty: 'Enter a passage with at least one character.',
  'too-long': `The passage is longer than ${MAX_CUSTOM_PASSAGE_LENGTH} characters after normalization. Shorten it to practice here.`,
};

const COMPOSITION_NOTE =
  'IME composition and dead keys are not supported in the typing field. Type plain keys instead.';

const REJECTION_NOTES: Record<EditRejection, string> = {
  expired: 'Time is up. Restart to run the session again.',
  paused: 'The session is paused. Resume to continue typing.',
  finished: 'The session has finished. Restart to run it again.',
  unsupported:
    'Only English letters, digits, punctuation and whitespace are scored here. That input was rejected, not recorded.',
};

export function TypingPractice() {
  const engineRef = useRef<ReturnType<typeof createTypingSession> | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createTypingSession({
      target: INITIAL_WORDS_PASSAGE,
      durationMs: DEFAULT_DURATION_SECONDS * 1000,
    });
  }
  const engine = engineRef.current;

  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() =>
    engine.snapshot(),
  );
  const [mode, setMode] = useState<PassageMode>('words');
  const [durationSeconds, setDurationSeconds] = useState(
    DEFAULT_DURATION_SECONDS,
  );
  const [passageDraft, setPassageDraft] = useState('');
  const [durationDraft, setDurationDraft] = useState('');
  const [passageError, setPassageError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const compositionActiveRef = useRef(false);
  const compositionCommitRef = useRef<string | null>(null);
  // Native beforeinput metadata for the pending insertion, if any.
  const pendingInsertionRef = useRef<{
    text: string;
    position: number;
  } | null>(null);

  const durationErrorId = useId();
  const passageErrorId = useId();

  // Draw the real random word passage only after hydration so the server
  // render stays deterministic (Strict Mode reruns are harmless resets).
  useEffect(() => {
    const session = engineRef.current;
    if (!session) return;
    session.restart({ target: getRandomWords(WORDS_PER_SESSION) });
    setSnapshot(session.snapshot());
  }, []);

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

  // Running -> paused on window blur or a hidden tab; idle is untouched.
  useEffect(() => {
    const pauseRunning = () => {
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
        compositionActiveRef.current ||
        event.isComposing ||
        event.inputType.toLowerCase().includes('composition')
      ) {
        if (event.cancelable) event.preventDefault();
        setNote(COMPOSITION_NOTE);
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
      compositionActiveRef.current ||
      ('isComposing' in native && native.isComposing) ||
      inputType.toLowerCase().includes('composition') ||
      (compositionCommitRef.current !== null &&
        data === compositionCommitRef.current)
    ) {
      if (!compositionActiveRef.current) compositionCommitRef.current = null;
      revertTypingField(COMPOSITION_NOTE);
      return;
    }
    compositionCommitRef.current = null;
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
    const result = session.applyEdit(event.currentTarget.value, insertion);
    setSnapshot(session.snapshot());
    if (result.accepted) {
      setNote(null);
    } else if (result.rejection !== null) {
      rejectEdit(result.rejection);
    }
  };

  const handleCompositionStart = () => {
    compositionActiveRef.current = true;
    compositionCommitRef.current = null;
    pendingInsertionRef.current = null;
  };

  const handleCompositionEnd = (
    event: CompositionEvent<HTMLTextAreaElement>,
  ) => {
    compositionActiveRef.current = false;
    // A canceled composition has no commit to reject. A subsequent real key
    // clears this marker, so rejection never depends on a timing window.
    compositionCommitRef.current = event.data || null;
    pendingInsertionRef.current = null;
    revertTypingField(COMPOSITION_NOTE);
  };

  const handleTypingKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (compositionActiveRef.current) return;
    if (!event.nativeEvent.isComposing) compositionCommitRef.current = null;
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
    compositionActiveRef.current = false;
    compositionCommitRef.current = null;
    pendingInsertionRef.current = null;
    const textarea = textareaRef.current;
    if (textarea) textarea.value = '';
    setPassageError(null);
    setDurationError(null);
    setNote(null);
    setSnapshot(session.snapshot());
  };

  const handleRestart = () => {
    restartSession();
  };

  const applyDuration = (seconds: number) => {
    restartSession({ durationMs: seconds * 1000 });
    setDurationSeconds(seconds);
  };

  const handleDurationSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const seconds = parseCustomDuration(durationDraft);
    if (seconds === null) {
      setDurationError(
        `Enter a whole number of seconds between ${MIN_CUSTOM_DURATION_SECONDS} and ${MAX_CUSTOM_DURATION_SECONDS}.`,
      );
      return;
    }
    setDurationDraft('');
    applyDuration(seconds);
  };

  const handleModeChange = (nextMode: PassageMode) => {
    if (nextMode === 'words') {
      restartSession({ target: getRandomWords(WORDS_PER_SESSION) });
    }
    setMode(nextMode);
  };

  const handlePassageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateCustomPassage(passageDraft);
    if (!result.ok) {
      setPassageError(PASSAGE_ERRORS[result.reason]);
      return;
    }
    restartSession({ target: result.passage });
  };

  const showLiveStats =
    snapshot.elapsedMs !== null &&
    snapshot.elapsedMs >= LIVE_STATS_MIN_ELAPSED_MS;

  const statusMessage =
    snapshot.status === 'idle'
      ? 'The timer starts with your first keystroke. Time away from the field is not counted.'
      : snapshot.status === 'paused'
        ? 'Paused — the clock is stopped. Resume to continue.'
        : null;

  const toggleClass = (active: boolean) =>
    `button button-secondary${active ? ` ${styles.active}` : ''}`;

  return (
    <div className={styles.root}>
      <div className={styles.controlRow}>
        <fieldset
          className={styles.controlGroup}
          disabled={settingsLocked}
          aria-label="Session duration"
        >
          <legend className={styles.legend}>Duration</legend>
          <div className={styles.buttonRow}>
            {DURATION_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={toggleClass(durationSeconds === seconds)}
                aria-pressed={durationSeconds === seconds}
                onClick={() => applyDuration(seconds)}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <form className={styles.inlineForm} onSubmit={handleDurationSubmit}>
            <label className={styles.customLabel}>
              Custom seconds
              <input
                className={styles.durationInput}
                inputMode="numeric"
                value={durationDraft}
                placeholder={`${MIN_CUSTOM_DURATION_SECONDS}–${MAX_CUSTOM_DURATION_SECONDS}`}
                aria-describedby={durationErrorId}
                aria-invalid={durationError ? true : undefined}
                onChange={(event) => {
                  setDurationDraft(event.target.value);
                  setDurationError(null);
                }}
              />
            </label>
            <button type="submit" className="button button-secondary">
              Set
            </button>
            {durationError && (
              <p className={styles.error} id={durationErrorId} role="alert">
                {durationError}
              </p>
            )}
          </form>
        </fieldset>

        <fieldset
          className={styles.controlGroup}
          disabled={settingsLocked}
          aria-label="Passage source"
        >
          <legend className={styles.legend}>Passage source</legend>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={toggleClass(mode === 'words')}
              aria-pressed={mode === 'words'}
              onClick={() => handleModeChange('words')}
            >
              Words
            </button>
            <button
              type="button"
              className={toggleClass(mode === 'custom')}
              aria-pressed={mode === 'custom'}
              onClick={() => handleModeChange('custom')}
            >
              Custom text
            </button>
          </div>
          {mode === 'custom' && (
            <form onSubmit={handlePassageSubmit}>
              <label className={styles.customLabel}>
                Your passage
                <textarea
                  className={styles.passageDraft}
                  rows={4}
                  value={passageDraft}
                  aria-describedby={passageErrorId}
                  aria-invalid={passageError ? true : undefined}
                  onChange={(event) => {
                    setPassageDraft(event.target.value);
                    setPassageError(null);
                  }}
                  placeholder={`Type or paste up to ${MAX_CUSTOM_PASSAGE_LENGTH} characters of English text`}
                />
              </label>
              <button type="submit" className="button button-secondary">
                Practice this passage
              </button>
              {passageError && (
                <p className={styles.error} id={passageErrorId} role="alert">
                  {passageError}
                </p>
              )}
            </form>
          )}
        </fieldset>
      </div>

      <dl className={styles.stats} aria-label="Live statistics">
        <div className={styles.stat}>
          <dt>Time</dt>
          <dd>{Math.ceil(snapshot.remainingMs / 1000)}s</dd>
        </div>
        <div className={styles.stat}>
          <dt>Net WPM</dt>
          <dd>{showLiveStats ? formatSpeed(snapshot.score.netWpm) : '—'}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Accuracy</dt>
          <dd>
            {showLiveStats ? formatPercent(snapshot.score.accuracy) : '—'}
          </dd>
        </div>
      </dl>

      <PassageView target={snapshot.target} typedText={snapshot.typedText} />

      <label className={styles.typingLabel}>
        Type the passage here
        <textarea
          ref={textareaRef}
          className={styles.typingInput}
          rows={3}
          value={snapshot.typedText}
          onInput={handleTypingInput}
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
        />
      </label>

      <p className={styles.statusLine} role="status">
        {note ?? statusMessage ?? ''}
        {snapshot.status === 'finished' &&
          (snapshot.finishedReason === 'target'
            ? ' Passage completed.'
            : ' Time is up.')}
      </p>

      <div className={styles.actions}>
        {snapshot.status === 'paused' && (
          <button
            type="button"
            className="button button-primary"
            onClick={handleResume}
          >
            Resume
          </button>
        )}
        <button
          type="button"
          className="button button-secondary"
          // Keep blur-triggered layout changes from interrupting this click.
          onPointerDown={(event) => event.preventDefault()}
          onClick={handleRestart}
        >
          Restart
        </button>
      </div>

      {snapshot.status === 'finished' && (
        <section className={styles.summary} aria-label="Session summary">
          <h2>Session summary</h2>
          <dl className={styles.summaryGrid}>
            <div>
              <dt>Net speed</dt>
              <dd>{formatSpeed(snapshot.score.netWpm)} WPM</dd>
            </div>
            <div>
              <dt>Gross speed</dt>
              <dd>{formatSpeed(snapshot.score.grossWpm)} WPM</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{formatPercent(snapshot.score.accuracy)}</dd>
            </div>
            <div>
              <dt>Active time</dt>
              <dd>
                {snapshot.elapsedMs === null
                  ? '—'
                  : `${Math.round(snapshot.elapsedMs / 1000)}s`}
              </dd>
            </div>
            <div>
              <dt>Keystrokes</dt>
              <dd>
                {snapshot.correctAttempts} correct /{' '}
                {snapshot.incorrectAttempts} incorrect
              </dd>
            </div>
          </dl>
          <p className={`muted ${styles.disclaimer}`}>
            Practice estimate from this session only — not an official
            qualification result.
          </p>
        </section>
      )}
    </div>
  );
}

function formatSpeed(value: number | null): string {
  return value === null ? '—' : String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
