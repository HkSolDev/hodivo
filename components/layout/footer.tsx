import Link from 'next/link';

export function Footer() {
  return (
    <footer className="page-width site-footer">
      <span className="brand">Hodivo</span>
      <p>Check the recruitment notice before applying.</p>
      <Link href="/how-it-works">How Hodivo works</Link>
      <Link href="/typing">Typing practice</Link>
      <Link href="/typing/exam">Typing exam simulation</Link>
      <Link href="/typing/leaderboard">Typing leaderboard</Link>
      <Link href="/tools/prepare-file" prefetch={false}>
        Resize files
      </Link>
    </footer>
  );
}
