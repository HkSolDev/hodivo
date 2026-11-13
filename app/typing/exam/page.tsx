import type { Metadata } from 'next';
import { ExamMode } from '@/components/typing/exam-mode';

export const metadata: Metadata = {
  title: 'Exam simulation | Typing',
  description:
    'Practice an exam simulation with reviewed duration and editing rules. Official scoring is unavailable.',
};

export default function TypingExamPage() {
  return (
    <>
      <h1>Typing exam simulation</h1>
      <noscript>
        <p>
          Enable JavaScript to load an exam passage and run the local timer.
        </p>
      </noscript>
      <ExamMode />
    </>
  );
}
