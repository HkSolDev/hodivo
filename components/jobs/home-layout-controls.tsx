'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import Form from 'next/form';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { homeSearchParams, type HomeView } from '@/frontend/home-view';
import type { JobFilters } from '@/frontend/public-job-filters';
import styles from './home-layout-controls.module.css';

export const LAYOUT_CHANGE_EVENT = 'aptus:layout-change';
type LayoutKey = 'layout' | 'recLayout';
type LayoutMode = HomeView['layout'];

function readLayoutFromLocation(
  key: LayoutKey,
  fallback: LayoutMode,
): LayoutMode {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(key);
  return value === 'rows' || value === 'cards' ? value : fallback;
}

export function useSyncedHomeView(view: HomeView): HomeView {
  const [layouts, setLayouts] = useState<{
    layout: LayoutMode;
    recLayout: LayoutMode;
  }>({
    layout: view.layout,
    recLayout: view.recLayout,
  });

  useEffect(() => {
    setLayouts({
      layout: readLayoutFromLocation('layout', view.layout),
      recLayout: readLayoutFromLocation('recLayout', view.recLayout),
    });
  }, [view.layout, view.recLayout]);

  useEffect(() => {
    const onLayoutChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{ key: LayoutKey; value: LayoutMode }>
      ).detail;
      if (!detail) return;
      setLayouts((current) => ({ ...current, [detail.key]: detail.value }));
    };
    const onPopState = () => {
      setLayouts({
        layout: readLayoutFromLocation('layout', view.layout),
        recLayout: readLayoutFromLocation('recLayout', view.recLayout),
      });
    };
    window.addEventListener(LAYOUT_CHANGE_EVENT, onLayoutChange);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener(LAYOUT_CHANGE_EVENT, onLayoutChange);
      window.removeEventListener('popstate', onPopState);
    };
  }, [view.layout, view.recLayout]);

  return {
    ...view,
    layout: layouts.layout,
    recLayout: layouts.recLayout,
  };
}

export function HomeViewFields({
  view,
  omit,
}: {
  view: HomeView;
  omit?: string;
}) {
  const syncedView = useSyncedHomeView(view);
  return Object.entries(syncedView)
    .filter(([key, value]) => key !== omit && value !== undefined)
    .map(([key, value]) => (
      <input key={key} type="hidden" name={key} value={value} />
    ));
}

export function HomeLayoutList({
  view,
  scope = 'all',
  className,
  children,
}: {
  view: HomeView;
  scope?: 'all' | 'rec';
  className: string;
  children: ReactNode;
}) {
  const syncedView = useSyncedHomeView(view);
  const mode = scope === 'all' ? syncedView.layout : syncedView.recLayout;
  return <div className={`${className} home-layout-${mode}`}>{children}</div>;
}

export function HomePaginationLink({
  filters,
  page,
  view,
  rel,
  children,
}: {
  filters: JobFilters;
  page: number;
  view: HomeView;
  rel: 'prev' | 'next';
  children: ReactNode;
}) {
  const syncedView = useSyncedHomeView(view);
  return (
    <Link
      className="button button-secondary"
      rel={rel}
      href={`/?${homeSearchParams(filters, page, syncedView)}#jobs`}
    >
      {children}
    </Link>
  );
}

export function HomeLayoutControls({
  filters,
  view,
  scope = 'all',
  page = 1,
}: {
  filters: JobFilters;
  view: HomeView;
  scope?: 'all' | 'rec';
  page?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const syncedView = useSyncedHomeView(view);
  const key: LayoutKey = scope === 'all' ? 'layout' : 'recLayout';
  const params = homeSearchParams(filters, page, syncedView);
  params.delete(key);
  return (
    <form
      action="/"
      method="get"
      onSubmit={(event) => {
        const submitter =
          event.nativeEvent instanceof SubmitEvent
            ? event.nativeEvent.submitter
            : null;
        if (!(submitter instanceof HTMLButtonElement)) return;
        const nextMode = submitter.value;
        if (nextMode !== 'rows' && nextMode !== 'cards') return;
        event.preventDefault();
        if (syncedView[key] === nextMode) return;
        const nextParams = new URLSearchParams(params);
        nextParams.set(key, nextMode);
        const nextHref = `/?${nextParams}${window.location.hash}`;
        const pendingSearch = Boolean(
          document.querySelector('[data-search-pending="true"]'),
        );
        window.history.replaceState(window.history.state, '', nextHref);
        window.dispatchEvent(
          new CustomEvent(LAYOUT_CHANGE_EVENT, {
            detail: { key, value: nextMode },
          }),
        );
        if (pendingSearch) {
          startTransition(() => {
            router.replace(nextHref, { scroll: false });
          });
        }
      }}
      className={styles.switch}
      aria-label={scope === 'all' ? 'All jobs layout' : 'Recommendation layout'}
    >
      {Array.from(params, ([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {(['rows', 'cards'] as const).map((mode) => (
        <button
          type="submit"
          key={mode}
          name={key}
          value={mode}
          aria-pressed={syncedView[key] === mode}
        >
          {mode === 'rows' ? 'List' : 'Cards'}
        </button>
      ))}
    </form>
  );
}

export function HomeReviewControls({ view }: { view: HomeView }) {
  return (
    <Form action="/" className="home-review-tools">
      <p>
        Local design review · fictional jobs and profile · no real sign-in or
        matching
      </p>
      <HomeViewFields view={view} omit="reviewProfile" />
      <label>
        Review profile
        <select
          name="reviewProfile"
          defaultValue={view.reviewProfile}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="guest">Guest</option>
          <option value="setup">Needs profile</option>
          <option value="ready">Example profile ready</option>
        </select>
      </label>
      <noscript>
        <button type="submit">Show review state</button>
      </noscript>
    </Form>
  );
}
