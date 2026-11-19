import { publicPageMetadata } from '@/components/jobs/job-sharing';
import { ExamMode } from '@/components/typing/exam-mode';

export const metadata = publicPageMetadata({
  title: 'Timed Typing Exam Simulation | Free Typing Practice',
  description:
    'Practice timed typing tests with real exam duration and backspace/editing rules. Open to anyone worldwide for typing speed drills and government exam prep.',
  pathname: '/typing/exam',
});

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
