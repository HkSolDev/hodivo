import type { Metadata } from 'next';
import { ExamMode } from '@/components/typing/exam-mode';

export const metadata: Metadata = {
  title: 'Exam simulation | Typing',
  description:
    'Practice an exam simulation with reviewed duration and editing rules. Official scoring is unavailable.',
};

export default function TypingExamPage() {
  return (
    <section
      className="typing-exam-page-shell"
      aria-labelledby="typing-exam-title"
    >
      <h1 id="typing-exam-title" className="sr-only">
        Typing exam simulation
      </h1>
      <noscript>
        <p>
          Enable JavaScript to load an exam passage and run the local timer.
        </p>
      </noscript>
      <ExamMode />
    </section>
  );
}
