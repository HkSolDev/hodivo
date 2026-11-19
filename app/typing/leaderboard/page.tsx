import { publicPageMetadata } from '@/components/jobs/job-sharing';
import { TypingLeaderboard } from '@/components/typing/typing-leaderboard';

export const metadata = publicPageMetadata({
  title: 'Typing Leaderboard | Speed & Accuracy Rankings',
  description:
    'Compare top Net WPM and accuracy scores per passage across Practice Mode and official Exam Mode.',
  pathname: '/typing/leaderboard',
});

export default function TypingLeaderboardPage() {
  return (
    <section aria-label="Typing leaderboard">
      <TypingLeaderboard />
    </section>
  );
}
