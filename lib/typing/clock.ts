// Pause-aware monotonic clock ported from the original scratch/clock.js.
// Active time excludes paused intervals; elapsedMs() is null until started.
export type TimeSource = () => number;

const defaultNow: TimeSource = () => performance.now();

export interface TypingClock {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  elapsedMs(): number | null;
}

export function createClock(now: TimeSource = defaultNow): TypingClock {
  let startAt: number | null = null;
  let stopAt: number | null = null;
  let pauseStart: number | null = null;
  let totalPausedMs = 0;

  return {
    start() {
      if (startAt !== null) return;
      startAt = now();
    },

    stop() {
      if (startAt === null || stopAt !== null) return;
      if (pauseStart !== null) {
        totalPausedMs += now() - pauseStart;
        pauseStart = null;
      }
      stopAt = now();
    },

    pause() {
      if (startAt !== null && stopAt === null && pauseStart === null) {
        pauseStart = now();
      }
    },

    resume() {
      if (pauseStart !== null) {
        totalPausedMs += now() - pauseStart;
        pauseStart = null;
      }
    },

    elapsedMs() {
      if (startAt === null) return null;
      const current = pauseStart !== null ? pauseStart : (stopAt ?? now());
      return current - startAt - totalPausedMs;
    },
  };
}
