import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';

import {
  MAX_CUSTOM_PASSAGE_LENGTH,
  parseCustomDuration,
  validateCustomPassage,
} from '../lib/typing/custom-input';
import { evaluate } from '../lib/typing/evaluate';
import { computeSessionScore } from '../lib/typing/scoring';
import { createTypingSession } from '../lib/typing/session';
import { INITIAL_WORDS_PASSAGE, getRandomWords } from '../lib/typing/words';

// Server components are imported through tsx with the Next tsconfig so JSX,
// path aliases and CSS module imports resolve like they do in the app build.
const { default: TypingPage }: typeof import('../app/typing/page') =
  await tsImport('../app/typing/page.tsx', {
    parentURL: import.meta.url,
    tsconfig: 'tsconfig.next.json',
  });

const { Footer }: typeof import('../components/layout/footer') = await tsImport(
  '../components/layout/footer.tsx',
  { parentURL: import.meta.url, tsconfig: 'tsconfig.next.json' },
);

const { PassageView }: typeof import('../components/typing/passage-view') =
  await tsImport('../components/typing/passage-view.tsx', {
    parentURL: import.meta.url,
    tsconfig: 'tsconfig.next.json',
  });

function createTimedSession(target: string, durationMs: number) {
  let time = 0;
  const session = createTypingSession({ target, durationMs }, () => time);
  return {
    session,
    advanceTo(nextTime: number) {
      time = nextTime;
    },
    now() {
      return time;
    },
  };
}

test('initial words passage is deterministic and word draws stay in the dictionary', () => {
  const words = INITIAL_WORDS_PASSAGE.split(' ');
  assert.equal(words.length, 50);
  const seeded = getRandomWords(50, () => 0);
  assert.equal(seeded, Array.from({ length: 50 }, () => 'the').join(' '));
  const drawn = getRandomWords(3, () => 0.999).split(' ');
  assert.ok(drawn.every((word) => word.length > 0));
});

test('acceptance: c x delete a t for cat in 6000ms keeps corrected errors in history', () => {
  const run = createTimedSession('cat', 60000);
  assert.equal(run.session.applyEdit('c').accepted, true);
  run.advanceTo(3000);
  assert.equal(run.session.applyEdit('cx').accepted, true);
  run.advanceTo(3000);
  assert.equal(run.session.applyEdit('c').accepted, true); // delete x
  run.advanceTo(6000);
  const result = run.session.applyEdit('cat'); // insert a, t at positions
  assert.equal(result.accepted, true);
  assert.equal(result.finished, true);

  const snapshot = run.session.snapshot();
  assert.equal(snapshot.status, 'finished');
  assert.equal(snapshot.typedText, 'cat');
  assert.equal(snapshot.insertedAttempts, 4);
  assert.equal(snapshot.correctAttempts, 3);
  assert.equal(snapshot.incorrectAttempts, 1);
  assert.equal(snapshot.elapsedMs, 6000);
  assert.equal(Math.round(snapshot.score.grossWpm ?? NaN), 8);
  assert.equal(Math.round(snapshot.score.netWpm ?? NaN), 6);
  assert.equal(Math.round(snapshot.score.accuracy), 75);
});

test('acceptance: 50 correct insertions in 60000ms score 10/10/100', () => {
  const target = 'a'.repeat(50);
  const run = createTimedSession(target, 120000);
  for (let index = 1; index <= 50; index++) {
    run.advanceTo(Math.round(((index - 1) * 60000) / 49));
    const result = run.session.applyEdit(target.slice(0, index));
    if (index === 50) {
      assert.equal(result.finished, true);
    }
  }
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.insertedAttempts, 50);
  assert.equal(snapshot.correctAttempts, 50);
  assert.equal(snapshot.incorrectAttempts, 0);
  assert.equal(snapshot.elapsedMs, 60000);
  assert.equal(snapshot.score.grossWpm, 10);
  assert.equal(snapshot.score.netWpm, 10);
  assert.equal(snapshot.score.accuracy, 100);
  assert.ok(Number.isFinite(snapshot.score.grossWpm ?? NaN));
});

test('speed is unavailable at zero elapsed time; accuracy still has a defined value', () => {
  const fresh = computeSessionScore(
    { insertedAttempts: 0, correctAttempts: 0, incorrectAttempts: 0 },
    0,
  );
  assert.equal(fresh.grossWpm, null);
  assert.equal(fresh.netWpm, null);
  assert.equal(fresh.accuracy, 100);

  const idleSession = createTypingSession(
    { target: 'cat', durationMs: 15000 },
    () => 0,
  );
  const snapshot = idleSession.snapshot();
  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.elapsedMs, null);
  assert.equal(snapshot.score.grossWpm, null);
  assert.ok(!Number.isNaN(snapshot.remainingMs));
});

test('expired before an edit: edit rejected, timer finishes, later edits stay rejected', () => {
  const run = createTimedSession('abcdef', 3000);
  run.advanceTo(0);
  assert.equal(run.session.applyEdit('a').accepted, true);
  run.advanceTo(3100);
  const rejected = run.session.applyEdit('ab');
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.rejection, 'expired');
  assert.equal(rejected.finished, true);
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.status, 'finished');
  assert.equal(snapshot.finishedReason, 'duration');
  assert.equal(snapshot.typedText, 'a');
  assert.equal(run.session.applyEdit('abc').accepted, false);
  assert.equal(run.session.snapshot().typedText, 'a');
});

test('paused time is not charged and edits are rejected while paused', () => {
  const run = createTimedSession('abcdef', 60000);
  run.advanceTo(0);
  run.session.applyEdit('a');
  run.advanceTo(1000);
  run.session.pause();
  assert.equal(run.session.snapshot().status, 'paused');
  assert.equal(run.session.applyEdit('ab').accepted, false);
  run.advanceTo(4000);
  run.session.resume();
  assert.equal(run.session.snapshot().status, 'running');
  run.advanceTo(5000);
  run.session.applyEdit('ab');
  assert.equal(run.session.snapshot().elapsedMs, 2000);
});

test('idle blur does not start the clock and finished sessions reject edits', () => {
  const run = createTimedSession('abcdef', 3000);
  run.session.pause();
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.elapsedMs, null);
  run.advanceTo(1000);
  assert.equal(run.session.snapshot().elapsedMs, null);
  run.session.applyEdit('a');
  run.advanceTo(4000);
  run.session.tick();
  assert.equal(run.session.snapshot().status, 'finished');
  assert.equal(run.session.applyEdit('ab').rejection, 'finished');
});

test('restart clears text, history and timer state', () => {
  const run = createTimedSession('abcdef', 3000);
  run.session.applyEdit('ab');
  run.advanceTo(1000);
  run.session.restart();
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.typedText, '');
  assert.equal(snapshot.insertedAttempts, 0);
  assert.equal(snapshot.elapsedMs, null);
  assert.equal(snapshot.remainingMs, 3000);
  assert.equal(run.session.applyEdit('ab').accepted, true);
  run.session.restart({ target: 'xyz', durationMs: 90000 });
  assert.equal(run.session.snapshot().target, 'xyz');
  assert.equal(run.session.snapshot().durationMs, 90000);
});

test('selection replacement and mid-text insertion compare positions in the target', () => {
  const run = createTimedSession('abcdef', 60000);
  run.session.applyEdit('a');
  run.session.applyEdit('ax');
  run.session.applyEdit('axc');
  // Replace the selected x with b: the inserted b sits at position 1.
  run.session.applyEdit('abc');
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.typedText, 'abc');
  assert.equal(snapshot.insertedAttempts, 4);
  assert.equal(snapshot.correctAttempts, 3);
  assert.equal(snapshot.incorrectAttempts, 1);

  const midInsert = createTimedSession('hello world', 60000);
  midInsert.session.applyEdit('hel');
  midInsert.session.applyEdit('hell');
  midInsert.session.applyEdit('helol');
  const after = midInsert.session.snapshot();
  assert.equal(after.insertedAttempts, 5);
  assert.equal(after.incorrectAttempts, 1);
});

test('browser sequence c, Shift+Left, c, ab on cab records four correct attempts', () => {
  const run = createTimedSession('cab', 60000);
  run.session.applyEdit('c');
  // Retyping the selected character leaves the value unchanged, so the
  // engine must rely on the native insertion metadata to count the attempt.
  const replaced = run.session.applyEdit('c', { text: 'c', position: 0 });
  assert.equal(replaced.accepted, true);
  assert.equal(run.session.snapshot().insertedAttempts, 2);
  assert.equal(run.session.snapshot().correctAttempts, 2);
  const finished = run.session.applyEdit('cab'); // inserts ab at 1..2
  assert.equal(finished.finished, true);
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.typedText, 'cab');
  assert.equal(snapshot.insertedAttempts, 4);
  assert.equal(snapshot.correctAttempts, 4);
  assert.equal(snapshot.incorrectAttempts, 0);
});

test('an unchanged value without insertion metadata never adds attempts', () => {
  const run = createTimedSession('cab', 60000);
  run.session.applyEdit('c');
  run.session.applyEdit('c');
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.insertedAttempts, 1);
  assert.equal(snapshot.correctAttempts, 1);
});

test('pausing after the deadline finishes the session instead of pausing', () => {
  const run = createTimedSession('a'.repeat(50), 1000);
  run.advanceTo(0);
  run.session.applyEdit('a');
  run.advanceTo(1100);
  run.session.pause();
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.status, 'finished');
  assert.equal(snapshot.finishedReason, 'duration');
  assert.equal(snapshot.elapsedMs, 1000);
  assert.equal(run.session.applyEdit('ab').accepted, false);
});

test('unsupported characters are blocked visibly and never scored', () => {
  const run = createTimedSession('ab', 60000);
  run.session.applyEdit('a');
  const rejected = run.session.applyEdit('aé');
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.rejection, 'unsupported');
  let snapshot = run.session.snapshot();
  assert.equal(snapshot.typedText, 'a');
  assert.equal(snapshot.insertedAttempts, 1);
  const metaRejected = run.session.applyEdit('a', { text: 'é', position: 0 });
  assert.equal(metaRejected.accepted, false);
  assert.equal(metaRejected.rejection, 'unsupported');
  snapshot = run.session.snapshot();
  assert.equal(snapshot.typedText, 'a');
  assert.equal(snapshot.insertedAttempts, 1);
  // Whitespace and plain ASCII remain supported, including mid-text inserts.
  assert.equal(run.session.applyEdit('a b').accepted, true);
});

test('deletion and unchanged edits never add attempts', () => {
  const run = createTimedSession('abcdef', 60000);
  run.session.applyEdit('ab');
  assert.equal(run.session.applyEdit('a').accepted, true);
  assert.equal(run.session.snapshot().insertedAttempts, 2);
  assert.equal(run.session.applyEdit('a').accepted, true);
  assert.equal(run.session.snapshot().insertedAttempts, 2);
  assert.equal(run.session.snapshot().correctAttempts, 2);
});

test('insertion beyond the target length finishes and counts the overflow as incorrect', () => {
  const run = createTimedSession('ab', 60000);
  const result = run.session.applyEdit('abc');
  assert.equal(result.finished, true);
  const snapshot = run.session.snapshot();
  assert.equal(snapshot.insertedAttempts, 3);
  assert.equal(snapshot.correctAttempts, 2);
  assert.equal(snapshot.incorrectAttempts, 1);
});

test('custom passages: normalization, empties, unsupported characters and length', () => {
  assert.equal(validateCustomPassage('hello   world').ok, true);
  assert.deepEqual(validateCustomPassage('hello   world'), {
    ok: true,
    passage: 'hello world',
  });
  assert.deepEqual(validateCustomPassage('  line one\n\tline two  '), {
    ok: true,
    passage: 'line one line two',
  });
  assert.deepEqual(validateCustomPassage(''), { ok: false, reason: 'empty' });
  assert.deepEqual(validateCustomPassage('   \n\t '), {
    ok: false,
    reason: 'empty',
  });
  assert.deepEqual(validateCustomPassage('café 😀'), {
    ok: false,
    reason: 'unsupported-characters',
  });
  assert.deepEqual(
    validateCustomPassage('x'.repeat(MAX_CUSTOM_PASSAGE_LENGTH + 1)),
    { ok: false, reason: 'too-long' },
  );
  assert.equal(
    validateCustomPassage('x'.repeat(MAX_CUSTOM_PASSAGE_LENGTH)).ok,
    true,
  );
});

test('custom duration accepts whole seconds 1..3600 and rejects everything else', () => {
  assert.equal(parseCustomDuration('45'), 45);
  assert.equal(parseCustomDuration(' 30 '), 30);
  assert.equal(parseCustomDuration('1'), 1);
  assert.equal(parseCustomDuration('3600'), 3600);
  assert.equal(parseCustomDuration(''), null);
  assert.equal(parseCustomDuration('45.5'), null);
  assert.equal(parseCustomDuration('abc'), null);
  assert.equal(parseCustomDuration('0'), null);
  assert.equal(parseCustomDuration('3601'), null);
  assert.equal(parseCustomDuration('-5'), null);
});

test('evaluate reports positional correctness and completion for the final text', () => {
  const result = evaluate('cat', 'cxt');
  assert.equal(result.correct, 2);
  assert.equal(result.incorrect, 1);
  assert.equal(result.done, true);
  assert.deepEqual(
    result.chars.map((char) => char.state),
    ['correct', 'incorrect', 'correct'],
  );
  assert.equal(evaluate('cat', 'ca').done, false);
});

test('passage styling allows long unbroken custom words to wrap inside the field', async () => {
  // Source-level guard for the overflow fix; actual 390px rendering is the
  // coordinator's browser acceptance check.
  const css = await readFile(
    new URL('../components/typing/typing-practice.module.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.word\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.word\s*\{[^}]*max-width:\s*100%/s);
});

test('server-rendered practice page, footer link and no-JS message stay literal text', async () => {
  const pageHtml = renderToStaticMarkup(createElement(TypingPage));
  assert.match(pageHtml, /Typing practice/);
  assert.match(pageHtml, /Enable JavaScript to use this page/);
  assert.match(pageHtml, /<label class="typingLabel">Type the passage here/);
  assert.match(pageHtml, /aria-label="Passage to type"/);
  assert.match(pageHtml, /role="switch"[^>]*aria-label="Live error highlight"/);
  // Catalogue requests start after hydration; SSR never invents a passage.
  assert.match(pageHtml, /disabled/);
  assert.doesNotMatch(pageHtml, /Custom text|Practice this passage/);
  assert.doesNotMatch(pageHtml, /<script/);

  const footerHtml = renderToStaticMarkup(createElement(Footer));
  assert.match(footerHtml, /href="\/typing"/);
  assert.match(footerHtml, /Typing practice/);
});

test('evaluate aligns word-by-word so missing or extra letters do not shift subsequent words', () => {
  const missing = evaluate('explore all', 'eplore all');
  const allWordStates = missing.chars.slice(-3).map((c) => c.state);
  assert.deepEqual(allWordStates, ['correct', 'correct', 'correct']);
  assert.equal(missing.done, true);

  const extra = evaluate('explore all', 'exploree all');
  assert.deepEqual(extra.chars[7], { ch: 'e', state: 'incorrect' });
  const extraAllStates = extra.chars.slice(-3).map((c) => c.state);
  assert.deepEqual(extraAllStates, ['correct', 'correct', 'correct']);
  assert.equal(extra.done, true);

  const doubleSpace = evaluate('cat dog', 'cat  dog');
  assert.equal(doubleSpace.correct, 7);
  assert.equal(doubleSpace.incorrect, 0);
  assert.equal(doubleSpace.done, true);

  const sessionMissing = createTimedSession('explore all', 60000);
  for (let i = 1; i <= 'eplore '.length; i++) {
    sessionMissing.session.applyEdit('eplore '.slice(0, i));
  }
  assert.equal(sessionMissing.session.snapshot().status, 'running');
  for (let i = 1; i <= 'all'.length; i++) {
    sessionMissing.session.applyEdit('eplore ' + 'all'.slice(0, i));
  }
  const missingSnap = sessionMissing.session.snapshot();
  assert.equal(missingSnap.status, 'finished');
  assert.equal(missingSnap.correctAttempts, 4);

  const sessionExtra = createTimedSession('explore all', 60000);
  sessionExtra.session.applyEdit('exploree al');
  assert.equal(sessionExtra.session.snapshot().status, 'running');
  sessionExtra.session.applyEdit('exploree all');
  assert.equal(sessionExtra.session.snapshot().status, 'finished');

  const highlightedHtml = renderToStaticMarkup(
    createElement(PassageView, {
      target: 'cat dog',
      typedText: 'cxt ',
      showFeedback: true,
    }),
  );
  assert.match(highlightedHtml, /class="correct"/);
  assert.match(highlightedHtml, /class="incorrect"/);

  const blindHtml = renderToStaticMarkup(
    createElement(PassageView, {
      target: 'cat dog',
      typedText: 'cxt ',
      showFeedback: false,
    }),
  );
  assert.doesNotMatch(blindHtml, /class="correct"|class="incorrect"/);
  assert.match(blindHtml, /class="typedNeutral"/);
  assert.match(blindHtml, /class="current"/);
});
