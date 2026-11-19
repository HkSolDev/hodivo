import { publicPageMetadata } from '@/components/jobs/job-sharing';
import { TypingPractice } from '@/components/typing/typing-practice';

export const metadata = publicPageMetadata({
  title: 'Free Online Typing Practice & Speed Test',
  description:
    'Free online typing speed and accuracy practice for anyone worldwide—measure WPM, errors, and accuracy in your browser with custom text or published exam passages. No signup required.',
  pathname: '/typing',
});

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
