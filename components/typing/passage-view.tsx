import { evaluate, type EvaluatedChar } from '@/lib/typing/evaluate';
import styles from './typing-practice.module.css';

interface PassageGroup {
  space: boolean;
  chars: EvaluatedChar[];
}

// Groups characters into word spans so lines break between words; long
// unbroken custom words still wrap inside their span (overflow-wrap).
function groupPassageChars(chars: EvaluatedChar[]): PassageGroup[] {
  const groups: PassageGroup[] = [];
  let buffer: EvaluatedChar[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      groups.push({ space: false, chars: buffer });
      buffer = [];
    }
  };
  for (const char of chars) {
    if (char.ch === ' ') {
      flush();
      groups.push({ space: true, chars: [char] });
    } else {
      buffer.push(char);
    }
  }
  flush();
  return groups;
}

export function PassageView({
  target,
  typedText,
}: {
  target: string;
  typedText: string;
}) {
  const evaluation = evaluate(target, typedText);
  return (
    <p className={styles.passage} aria-label="Passage to type">
      {groupPassageChars(evaluation.chars).map((group, groupIndex) => (
        <span
          key={groupIndex}
          className={group.space ? styles.space : styles.word}
        >
          {group.chars.map((char, charIndex) => (
            <span key={charIndex} className={styles[char.state]}>
              {char.ch}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
