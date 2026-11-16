import type { Metadata } from 'next';
import { TypingPractice } from '@/components/typing/typing-practice';

export const metadata: Metadata = {
  title: 'Typing practice',
  description:
    'Practice typing speed and accuracy with published exam passages. Time away from the field is not counted.',
};

export default function TypingPage() {
  return (
    <section aria-labelledby="typing-title" className="typing-page-shell">
      <div className="sr-only">
        <h1 id="typing-title">Typing practice</h1>
        <p className="muted">
          Build typing speed and accuracy with published exam passages in a 1, 2
          or 3 minute session. Corrections count in the attempt history, and no
          typing leaves your browser.
        </p>
      </div>
      <noscript>
        <p>
          Typing practice needs JavaScript to time the session, pause while you
          are away, and record each keystroke. Enable JavaScript to use this
          page.
        </p>
      </noscript>
      <TypingPractice />
    </section>
  );
}
