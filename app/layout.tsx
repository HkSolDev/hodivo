import type { Metadata, Viewport } from 'next';
import { WorkspaceProvider } from '@/components/providers/workspace-provider';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { WebAnalytics } from '@/components/layout/web-analytics';
import { SkipLink } from '@/components/layout/skip-link';
import { DesignReviewProvider } from '@/components/jobs/design-review-state';
import {
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
} from '@/components/jobs/job-sharing';

import '@/public/css/tokens.css';
import '@/public/css/base.css';
import '@/public/css/layout.css';
import '@/public/css/navigation.css';
import '@/public/css/components.css';
import '@/public/css/catalogue.css';
import '@/public/css/sign-in.css';
import '@/public/css/home.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: HOME_SEO_TITLE,
    template: '%s | Hodivo',
  },
  description: HOME_SEO_DESCRIPTION,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const review =
    process.env.APTUS_LOCAL_REVIEW === '1' &&
    process.env.NODE_ENV === 'development';
  const content = (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="page-width">
        {children}
      </main>
      <Footer />
    </>
  );
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("aptus-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();',
          }}
        />
      </head>
      <body>
        <SkipLink />
        <WorkspaceProvider>
          {review ? (
            <DesignReviewProvider>{content}</DesignReviewProvider>
          ) : (
            content
          )}
        </WorkspaceProvider>
        <WebAnalytics />
      </body>
    </html>
  );
}
