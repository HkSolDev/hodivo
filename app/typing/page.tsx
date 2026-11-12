import type { Metadata } from 'next';
import { TypingPractice } from '@/components/typing/typing-practice';

export const metadata: Metadata = {
  title: 'Typing practice',
  description:
    'Practice typing speed and accuracy with random words or your own passage. Time away from the field is not counted.',
};

export default function TypingPage() {
  return (
    <section aria-labelledby="typing-title">
      <h1 id="typing-title">Typing practice</h1>
      <p className="muted">
        Build typing speed and accuracy with a 15, 30 or 60 second session, or
        bring your own passage. Corrections count in the attempt history, and no
        typing leaves your browser.
      </p>
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
