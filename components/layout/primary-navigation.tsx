'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type FocusEvent, type ReactNode } from 'react';
import { useWorkspace } from '@/components/providers/workspace-provider';

const TYPING_MODES = [
  {
    href: '/typing',
    label: 'Practice Mode',
    description: 'Timed 1m, 2m, 3m speed & accuracy practice',
  },
  {
    href: '/typing/exam',
    label: 'Exam Mode',
    description: 'Official SSC / Govt benchmark simulation',
  },
  {
    href: '/typing/leaderboard',
    label: 'Leaderboard',
    description: 'Top speed and accuracy rankings per passage',
  },
  {
    href: '/typing/progress',
    label: 'Progress',
    description: 'Your past passages, speeds, and exam validity',
  },
] as const;

function isTypingModeActive(pathname: string, modeHref: string): boolean {
  if (modeHref === '/typing/exam') return pathname.startsWith('/typing/exam');
  if (modeHref === '/typing/leaderboard') {
    return pathname.startsWith('/typing/leaderboard');
  }
  if (modeHref === '/typing/progress') {
    return pathname.startsWith('/typing/progress');
  }
  return (
    pathname === '/typing' ||
    (pathname.startsWith('/typing/') &&
      !pathname.startsWith('/typing/exam') &&
      !pathname.startsWith('/typing/leaderboard') &&
      !pathname.startsWith('/typing/progress'))
  );
}

const destinations = [
  {
    href: '/',
    label: 'Home',
    wideSuffix: '',
    icon: (
      <>
        <path d="m3 10 9-7 9 7v10H3z" />
        <path d="M9 20v-7h6v7" />
      </>
    ),
  },
  {
    href: '/saved',
    label: 'Saved',
    wideSuffix: ' jobs',
    icon: <path d="M6 3h12v18l-6-4-6 4z" />,
  },
  {
    href: '/typing',
    label: 'Typing',
    wideSuffix: ' practice',
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h8" />
      </>
    ),
  },
  {
    href: '/tools/prepare-file',
    label: 'Resize',
    wideSuffix: ' files',
    icon: (
      <>
        <path d="M6 3h8l4 4v14H6zM14 3v5h4" />
        <path d="M9 13h6m-6 4h6" />
      </>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    wideSuffix: '',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
  },
];

function NavLinkContent({
  label,
  wideSuffix,
  icon,
  hasDropdown,
}: {
  label: string;
  wideSuffix?: string;
  icon: ReactNode;
  hasDropdown?: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon}
      </svg>
      <span>
        {label}
        {wideSuffix && (
          <span className="navigation-wide-label">{wideSuffix}</span>
        )}
      </span>
      {hasDropdown && (
        <svg
          className="nav-dropdown-chevron"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <span
        className="nav-pending-dot"
        data-pending={pending}
        aria-hidden="true"
      />
    </>
  );
}

export function HeaderModeBreadcrumb() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isTypingRoute =
    pathname === '/typing' || pathname.startsWith('/typing/');
  if (!isTypingRoute) return null;

  const isExamMode = pathname.startsWith('/typing/exam');
  const currentLabel = isExamMode ? 'Exam Mode' : 'Practice Mode';

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
    }
  };

  return (
    <div className="header-mode-switcher">
      <span className="header-breadcrumb-divider" aria-hidden="true">
        |
      </span>
      <span className="header-portal-label">Exam Simulation Portal</span>
      <span className="header-breadcrumb-chevron" aria-hidden="true">
        ›
      </span>
      <div
        className="mode-switcher-wrap"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={handleBlur}
      >
        <button
          type="button"
          className="mode-switcher-pill"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="mode-switcher-dot" aria-hidden="true" />
          <span>{currentLabel}</span>
          <svg
            className={`mode-switcher-chevron${open ? ' mode-switcher-chevron-open' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {open && (
          <div className="mode-switcher-menu" aria-label="Switch typing mode">
            {TYPING_MODES.map((mode) => {
              const selected = isTypingModeActive(pathname, mode.href);
              return (
                <Link
                  key={mode.href}
                  href={mode.href}
                  className={`mode-switcher-option${selected ? ' mode-switcher-option-active' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  <div className="mode-switcher-option-top">
                    <span className="mode-switcher-option-title">
                      {mode.label}
                    </span>
                    {selected && (
                      <span className="mode-switcher-active-tag">Active</span>
                    )}
                  </div>
                  <span className="mode-switcher-option-desc">
                    {mode.description}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function PrimaryNavigation() {
  const pathname = usePathname();
  const { accountName } = useWorkspace();
  const [typingDropdownOpen, setTypingDropdownOpen] = useState(false);
  const signedIn = accountName !== null;
  const active =
    pathname === '/sign-in'
      ? '/sign-in'
      : pathname === '/' ||
          pathname.startsWith('/jobs/') ||
          pathname === '/results'
        ? '/'
        : destinations.find(
            ({ href }) =>
              href !== '/' &&
              (pathname === href || pathname.startsWith(`${href}/`)),
          )?.href;

  const openTypingDropdownDesktop = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 760) {
      setTypingDropdownOpen(true);
    }
  };

  const handleTypingBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setTypingDropdownOpen(false);
    }
  };

  return (
    <nav className="primary-navigation" aria-label="Main navigation">
      {destinations.map(
        ({ href: destination, label: title, wideSuffix, icon }) => {
          const href =
            destination === '/profile' && !signedIn ? '/sign-in' : destination;
          const label =
            destination === '/profile' && !signedIn ? 'Sign in' : title;

          if (destination === '/typing') {
            return (
              <div
                key={href}
                className="nav-typing-group"
                onMouseEnter={openTypingDropdownDesktop}
                onMouseLeave={() => setTypingDropdownOpen(false)}
                onFocus={openTypingDropdownDesktop}
                onBlur={handleTypingBlur}
              >
                <Link
                  href={href}
                  aria-current={active === href ? 'page' : undefined}
                >
                  <NavLinkContent
                    label={label}
                    wideSuffix={wideSuffix}
                    icon={icon}
                    hasDropdown
                  />
                </Link>
                {typingDropdownOpen && (
                  <div
                    className="nav-typing-dropdown"
                    aria-label="Typing modes"
                  >
                    {TYPING_MODES.map((mode) => {
                      const isCurrentMode = isTypingModeActive(
                        pathname,
                        mode.href,
                      );
                      return (
                        <Link
                          key={mode.href}
                          href={mode.href}
                          className={`nav-typing-dropdown-item${isCurrentMode ? ' nav-typing-dropdown-item-active' : ''}`}
                          onClick={() => setTypingDropdownOpen(false)}
                        >
                          <div className="mode-switcher-option-top">
                            <span className="mode-switcher-option-title">
                              {mode.label}
                            </span>
                            {isCurrentMode && (
                              <span className="mode-switcher-active-tag">
                                Active
                              </span>
                            )}
                          </div>
                          <span className="mode-switcher-option-desc">
                            {mode.description}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              prefetch={
                destination === '/tools/prepare-file' ? false : undefined
              }
              aria-current={active === href ? 'page' : undefined}
            >
              <NavLinkContent
                label={label}
                wideSuffix={wideSuffix}
                icon={icon}
              />
            </Link>
          );
        },
      )}
    </nav>
  );
}
