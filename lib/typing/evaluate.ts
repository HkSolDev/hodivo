// Positional final-text evaluation ported from the original evaluate.js.
// Compares code units one position at a time (English ASCII practice input).
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
}

export function evaluate(target: string, typed: string): Evaluation {
  let correct = 0;
  let incorrect = 0;

  for (let index = 0; index < typed.length; index++) {
    if (typed[index] === target[index]) {
      correct++;
    } else {
      incorrect++;
    }
  }

  const chars: EvaluatedChar[] = [...target].map((ch, index) => {
    let state: CharacterState = 'untyped';
    if (index < typed.length) {
      state = typed[index] === ch ? 'correct' : 'incorrect';
    } else if (index === typed.length) {
      state = 'current';
    }
    return { ch, state };
  });

  return {
    chars,
    correct,
    incorrect,
    done: typed.length >= target.length,
  };
}
