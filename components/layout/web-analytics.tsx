'use client';

import { Analytics, type BeforeSend } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const publicPage =
  /^\/(?:jobs\/[A-Za-z0-9_-]+|how-it-works|tools\/prepare-file|typing(?:\/(?:exam|leaderboard))?)?$/;

export function publicTelemetryEvent<Event extends { url: string }>(
  event: Event,
): Event | null {
  const url = new URL(event.url);
  if (!publicPage.test(url.pathname)) return null;
  return { ...event, url: url.origin + url.pathname };
}

export const publicPageView: BeforeSend = (event) =>
  event.type === 'pageview' ? publicTelemetryEvent(event) : null;

export function WebAnalytics() {
  return (
    <>
      <Analytics beforeSend={publicPageView} />
      <SpeedInsights beforeSend={publicTelemetryEvent} />
    </>
  );
}
