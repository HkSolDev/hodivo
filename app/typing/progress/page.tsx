import { publicPageMetadata } from '@/components/jobs/job-sharing';
import { TypingProgress } from '@/components/typing/typing-progress';

export const metadata = publicPageMetadata({
  title: 'Typing Progress | Attempt History & Exam Readiness',
  description:
    'Review your past typing passages, Practice vs. Exam speeds, and official exam rule validity.',
  pathname: '/typing/progress',
});

export default function TypingProgressPage() {
  return (
    <section aria-label="Typing progress">
      <TypingProgress />
    </section>
  );
}
