'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { evaluate, type EvaluatedChar } from '@/lib/typing/evaluate';
import styles from './typing-practice.module.css';

interface PassageGroup {
  kind: 'word' | 'space' | 'newline';
  chars: EvaluatedChar[];
}

// Groups characters into word spans so lines break between words; long
// unbroken custom words still wrap inside their span (overflow-wrap).
function groupPassageChars(chars: EvaluatedChar[]): PassageGroup[] {
  const groups: PassageGroup[] = [];
  let buffer: EvaluatedChar[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      groups.push({ kind: 'word', chars: buffer });
      buffer = [];
    }
  };
  for (const char of chars) {
    if (char.ch === '\n') {
      flush();
      groups.push({ kind: 'newline', chars: [char] });
    } else if (char.ch === ' ') {
      flush();
      groups.push({ kind: 'space', chars: [char] });
    } else {
      buffer.push(char);
    }
  }
  flush();
  return groups;
}

export const PassageView = memo(function PassageView({
  target,
  typedText,
}: {
  target: string;
  typedText: string;
}) {
  const groups = useMemo(
    () => groupPassageChars(evaluate(target, typedText).chars),
    [target, typedText],
  );
  const containerRef = useRef<HTMLParagraphElement | null>(null);
  const currentRef = useRef<HTMLSpanElement | null>(null);
  const lastLineTopRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const current = currentRef.current;
    if (!container || !current) return;

    const lineTop = current.offsetTop;
    if (lastLineTopRef.current === lineTop) return;
    lastLineTopRef.current = lineTop;

    const lineHeight =
      Number.parseFloat(getComputedStyle(container).lineHeight) || 0;
    // Keep 1 completed line above the active line (Monkeytype-style window).
    const targetTop = Math.max(0, lineTop - container.offsetTop - lineHeight);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
      container.scrollTop = targetTop;
    }
  }, [typedText.length, target]);

  return (
    <p
      ref={containerRef}
      className={styles.passage}
      aria-label="Passage to type"
    >
      {groups.map((group, groupIndex) => {
        if (group.kind === 'newline') {
          const char = group.chars[0];
          return (
            <span key={groupIndex}>
              <span
                ref={char.state === 'current' ? currentRef : undefined}
                className={styles[char.state]}
              >
                {' '}
              </span>
              <br />
            </span>
          );
        }
        return (
          <span
            key={groupIndex}
            className={group.kind === 'space' ? styles.space : styles.word}
          >
            {group.chars.map((char, charIndex) => (
              <span
                key={charIndex}
                ref={char.state === 'current' ? currentRef : undefined}
                className={styles[char.state]}
              >
                {char.ch}
              </span>
            ))}
          </span>
        );
      })}
    </p>
  );
});
