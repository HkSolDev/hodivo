'use client';

import { Analytics, type BeforeSend } from '@vercel/analytics/next';

const publicPage =
  /^\/(?:jobs\/[A-Za-z0-9_-]+|how-it-works|tools\/prepare-file|typing(?:\/(?:exam|leaderboard))?)?$/;

export const publicPageView: BeforeSend = (event) => {
  if (event.type !== 'pageview') return null;
  const url = new URL(event.url);
  if (!publicPage.test(url.pathname)) return null;
  return { ...event, url: url.origin + url.pathname };
};

export function WebAnalytics() {
  return <Analytics beforeSend={publicPageView} />;
}
