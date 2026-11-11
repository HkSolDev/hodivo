import type { Metadata } from 'next';
import Link from 'next/link';
import {
  HOW_IT_WORKS_SEO_DESCRIPTION,
  HOW_IT_WORKS_SEO_TITLE,
  publicPageMetadata,
} from '@/components/jobs/job-sharing';

export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: HOW_IT_WORKS_SEO_TITLE,
    description: HOW_IT_WORKS_SEO_DESCRIPTION,
    pathname: '/how-it-works',
    origin: process.env.SITE_URL,
  });
}

export default function HowItWorksPage() {
  return (
    <section
      id="how-it-works"
      className="how-it-works"
      aria-labelledby="how-title"
    >
      <div>
        <p className="eyebrow">03 / BEFORE YOU APPLY</p>
        <h1
          id="how-title"
          style={{
            font: 'clamp(2.3rem, 5vw, 3.6rem)/1.1 var(--serif)',
            letterSpacing: '-0.035em',
          }}
        >
          Clarity, with context.
        </h1>
      </div>
      <div>
        <p>
          Hodivo compares your details with saved notification requirements. An
          incomplete or conditional rule needs a closer look at the source.
        </p>
        <details style={{ marginTop: 'var(--space-4)' }}>
          <summary>What should I verify at the source?</summary>
          <p>
            Read the original notification for application dates, subject
            requirements, age reference dates, category conditions, and any
            corrections. A match here is a starting point, not an application
            decision.
          </p>
        </details>
        <p style={{ marginTop: 'var(--space-6)' }}>
          <Link className="button button-primary" href="/profile">
            Check eligibility with your profile →
          </Link>
        </p>
      </div>
    </section>
  );
}
