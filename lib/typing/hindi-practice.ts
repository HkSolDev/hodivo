import type { Evaluation } from './evaluate';

export const hindiPassage = {
  id: 'local-hindi-pilot',
  title: 'हिन्दी अभ्यास',
  text: 'सुबह मैं अपनी किताबें लेकर पुस्तकालय गया। वहाँ कक्षा के बच्चों ने मिलकर एक कहानी पढ़ी।',
};

const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });

export function hindiGroups(text: string): string[] {
  return Array.from(
    segmenter.segment(text.normalize('NFC')),
    ({ segment }) => segment,
  );
}

export function compareHindiText(
  target: string[],
  text: string,
  finished: boolean,
) {
  const groups = hindiGroups(text);
  const last = groups.at(-1);
  const expected = target[groups.length - 1];
  // A direct-input keyboard can add a vowel mark in a separate edit.
  const pending =
    !finished &&
    last !== undefined &&
    expected !== undefined &&
    last !== expected &&
    expected.normalize('NFD').startsWith(last.normalize('NFD'));
  const compared = groups.length - Number(pending);
  const correct = groups
    .slice(0, compared)
    .filter((group, index) => group === target[index]).length;
  return { groups, compared, correct };
}

export function evaluateHindi(
  targetText: string,
  text: string,
  finished: boolean,
): Evaluation {
  const words = targetText.normalize('NFC').trim().split(/\s+/);
  const typedWords = text.normalize('NFC').trimStart().split(/\s+/);
  const chars: Evaluation['chars'] = [];
  let correct = 0;
  let incorrect = 0;
  let targetIndex = 0;
  const wordCounts = { typed: 0, correct: 0, skipped: 0 };
  let done = false;

  for (let index = 0; index < typedWords.length; index++) {
    const typed = typedWords[index]!;
    if (typed) wordCounts.typed++;
    const hasSpace = index < typedWords.length - 1;
    const expected = words[targetIndex];
    if (expected === undefined) {
      for (const ch of hindiGroups(typed + (hasSpace ? ' ' : ''))) {
        chars.push({ ch, state: 'incorrect' });
        incorrect++;
      }
      continue;
    }

    // An exact match for the next word can recover from one skipped word.
    if (
      typed !== expected &&
      typed === words[targetIndex + 1] &&
      (hasSpace || !expected.startsWith(typed))
    ) {
      for (const ch of hindiGroups(expected + ' ')) {
        chars.push({ ch, state: 'incorrect' });
      }
      wordCounts.skipped++;
      targetIndex++;
    }

    if (typed === words[targetIndex]) wordCounts.correct++;
    const word = hindiGroups(words[targetIndex]!);
    const {
      groups,
      compared,
      correct: matches,
    } = compareHindiText(word, typed, hasSpace || finished);
    const settled = hasSpace ? Math.max(word.length, compared) : compared;
    correct += matches;
    incorrect += compared - matches;
    if (targetIndex === words.length - 1) {
      done = hasSpace || compared >= word.length;
    }

    for (const [position, ch] of word.entries()) {
      chars.push({
        ch,
        state:
          position < settled
            ? groups[position] === ch
              ? 'correct'
              : 'incorrect'
            : !finished && position === settled
              ? 'current'
              : 'untyped',
      });
    }
    for (const ch of groups.slice(word.length, settled)) {
      chars.push({ ch, state: 'incorrect' });
    }

    if (targetIndex < words.length - 1) {
      const atSpace = !finished && settled >= word.length;
      chars.push({
        ch: ' ',
        state: hasSpace ? 'correct' : atSpace ? 'current' : 'untyped',
      });
      if (hasSpace) correct++;
    }
    targetIndex++;
  }
  for (; targetIndex < words.length; targetIndex++) {
    for (const ch of hindiGroups(words[targetIndex]!)) {
      chars.push({ ch, state: 'untyped' });
    }
    if (targetIndex < words.length - 1)
      chars.push({ ch: ' ', state: 'untyped' });
  }

  return {
    chars,
    correct,
    incorrect,
    done,
    words: wordCounts,
  };
}
