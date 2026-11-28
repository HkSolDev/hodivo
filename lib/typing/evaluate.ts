// Word-by-word evaluation: space resets alignment so a missing/extra character
// in one word never shifts subsequent words.
export type CharacterState = 'correct' | 'incorrect' | 'current' | 'untyped';

export interface EvaluatedChar {
  ch: string;
  state: CharacterState;
}

export interface Evaluation {
  chars: EvaluatedChar[];
  correct: number;
  incorrect: number;
  done: boolean;
  words?: { typed: number; correct: number; skipped: number };
}

export function evaluate(target: string, typed: string): Evaluation {
  const tokens = target.match(/\S+|\s+/g) ?? [];
  const trimmedLeading = typed.replace(/^ +/, '');
  const typedWords =
    trimmedLeading.length === 0
      ? []
      : trimmedLeading.replace(/ +$/, ' ').split(/ +/);

  const chars: EvaluatedChar[] = [];
  let correct = 0;
  let incorrect = 0;
  let wordIdx = 0;
  let cursorPlaced = false;
  let lastWordLen = 0;

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      const spaceTyped = wordIdx > 0 && wordIdx - 1 < typedWords.length - 1;
      for (const ch of token) {
        if (spaceTyped) {
          chars.push({ ch, state: 'correct' });
          correct++;
        } else if (
          !cursorPlaced &&
          wordIdx - 1 === typedWords.length - 1 &&
          typedWords[wordIdx - 1]!.length >= lastWordLen
        ) {
          chars.push({ ch, state: 'current' });
          cursorPlaced = true;
        } else {
          chars.push({ ch, state: 'untyped' });
        }
      }
      continue;
    }

    const tw = wordIdx < typedWords.length ? typedWords[wordIdx]! : null;
    const isCompleted = wordIdx < typedWords.length - 1;
    lastWordLen = token.length;

    for (let cIdx = 0; cIdx < token.length; cIdx++) {
      const ch = token[cIdx]!;
      if (tw !== null && cIdx < tw.length) {
        if (tw[cIdx] === ch) {
          chars.push({ ch, state: 'correct' });
          correct++;
        } else {
          chars.push({ ch, state: 'incorrect' });
          incorrect++;
        }
      } else if (isCompleted) {
        chars.push({ ch, state: 'incorrect' });
        incorrect++;
      } else if (!cursorPlaced && tw !== null && cIdx === tw.length) {
        chars.push({ ch, state: 'current' });
        cursorPlaced = true;
      } else if (!cursorPlaced && tw === null && wordIdx === 0) {
        chars.push({ ch, state: 'current' });
        cursorPlaced = true;
      } else {
        chars.push({ ch, state: 'untyped' });
      }
    }

    if (tw !== null && tw.length > token.length) {
      for (let extraIdx = token.length; extraIdx < tw.length; extraIdx++) {
        chars.push({ ch: tw[extraIdx]!, state: 'incorrect' });
        incorrect++;
      }
    }

    wordIdx++;
  }

  const done =
    wordIdx === 0
      ? true
      : typedWords.length > wordIdx ||
        (typedWords.length === wordIdx &&
          typedWords[wordIdx - 1]!.length >= lastWordLen);

  return {
    chars,
    correct,
    incorrect,
    done,
  };
}
