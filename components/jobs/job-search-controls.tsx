'use client';

import {
  useState,
  useSyncExternalStore,
  useTransition,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react';
import Form from 'next/form';
import { useRouter } from 'next/navigation';
import { type HomeView, homeSearchParams } from '@/frontend/home-view';
import {
  decideSearch,
  idleSearch,
  interruptSearch,
  noteSearchLocation,
  type SearchFeedback,
  type SearchOutcome,
} from '@/frontend/search-pending';
import {
  HomeViewFields,
  LAYOUT_CHANGE_EVENT,
  useSyncedHomeView,
} from './home-layout-controls';
import styles from './job-search-controls.module.css';
import {
  JOB_QUALIFICATIONS,
  type JobFilters,
} from '@/frontend/public-job-filters';

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const SEARCH_INPUT_ID = 'job-search-q';
const SORT_OPTIONS: ReadonlyArray<{
  value: JobFilters['sort'];
  label: string;
}> = [
  { value: 'newest', label: 'Latest' },
  { value: 'popular', label: 'Trending' },
  { value: 'soonest', label: 'Closing soon' },
  { value: 'furthest', label: 'Closing last' },
];

function scrollActivePill(rail: HTMLElement | null) {
  if (!rail || rail.scrollWidth <= rail.clientWidth) return;
  const active = rail.querySelector<HTMLElement>('[aria-pressed="true"]');
  active?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

export function JobSearchRegion({
  filters,
  view,
  page,
  outcome,
  children,
  results,
}: {
  filters: JobFilters;
  view: HomeView;
  page: number;
  outcome: SearchOutcome;
  children?: ReactNode;
  results: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(filters.q);
  const [pendingQualification, setPendingQualification] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<SearchFeedback>(idleSearch);
  const feedbackRef = useRef(feedback);
  const qualRailRef = useRef<HTMLDivElement>(null);
  const dirtyDraft = useRef(false);
  const restoreDraft = useRef(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const syncedView = useSyncedHomeView(view);
  const pending = feedback.pendingHref !== null;
  const activeQualification =
    pending && pendingQualification !== null
      ? pendingQualification
      : filters.qualification;
  const qualificationOptions = [
    { value: '', label: 'All' },
    ...JOB_QUALIFICATIONS,
  ] as const;
  feedbackRef.current = feedback;

  useEffect(() => {
    scrollActivePill(qualRailRef.current);
  }, [activeQualification]);

  useEffect(() => {
    // Sort, layout, and page can change while the committed query stays the
    // same. Those navigations must still replace an unsubmitted draft.
    if (pending && !restoreDraft.current) return;
    if (restoreDraft.current || !dirtyDraft.current) setDraft(filters.q);
    dirtyDraft.current = false;
    restoreDraft.current = false;
  }, [
    filters.q,
    filters.qualification,
    filters.sort,
    view.layout,
    view.recLayout,
    view.recSort,
    view.reviewProfile,
    page,
    pending,
  ]);

  useEffect(() => {
    setFeedback((current) =>
      noteSearchLocation(current, window.location.href, outcome),
    );
  }, [filters, view, page, outcome]);

  useEffect(() => {
    const onInterrupt = () => {
      restoreDraft.current = true;
      feedbackRef.current = idleSearch;
      setFeedback(interruptSearch());
    };
    window.addEventListener('popstate', onInterrupt);
    window.addEventListener(LAYOUT_CHANGE_EVENT, onInterrupt);
    return () => {
      window.removeEventListener('popstate', onInterrupt);
      window.removeEventListener(LAYOUT_CHANGE_EVENT, onInterrupt);
    };
  }, []);

  function submitHref(href: string) {
    const decision = decideSearch(
      feedbackRef.current,
      href,
      window.location.href,
    );
    if (decision.kind === 'ignore') return;
    dirtyDraft.current = false;
    if (decision.kind === 'cancel') {
      // A new navigation discards Next's in-flight one, so the older search
      // cannot commit over the page the user just asked to keep.
      feedbackRef.current = idleSearch;
      setFeedback(idleSearch);
      const stay = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      startTransition(() => {
        router.push(stay, { scroll: false });
      });
      return;
    }
    feedbackRef.current = decision.feedback;
    setFeedback(decision.feedback);
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  function submitQualification(nextQualification: JobFilters['qualification']) {
    const params = homeSearchParams(
      {
        q: draft,
        qualification: nextQualification,
        sort: filters.sort,
      },
      1,
      syncedView,
    );
    const query = params.toString();
    setPendingQualification(nextQualification);
    submitHref(query ? `/?${query}` : '/');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // String-action <Form> navigates outside a transition, so useFormStatus
    // stays idle. preventDefault and push inside our own bookkeeping.
    event.preventDefault();
    setPendingQualification(null);
    const params = homeSearchParams(
      {
        q: draft,
        qualification: filters.qualification,
        sort: filters.sort,
      },
      1,
      syncedView,
    );
    const query = params.toString();
    submitHref(query ? `/?${query}` : '/');
  }

  function clearDraft() {
    if (feedbackRef.current.pendingHref) dirtyDraft.current = true;
    setDraft('');
    document.getElementById(SEARCH_INPUT_ID)?.focus();
  }

  return (
    <>
      <Form
        action="/"
        scroll={false}
        className={styles.search}
        onSubmit={onSubmit}
      >
        <p className="sr-only" role="status" aria-live="polite">
          {feedback.notice}
        </p>
        <input type="hidden" name="sort" value={filters.sort} />
        <HomeViewFields view={syncedView} />
        <div className={styles.query}>
          <label className={styles.searchLabel} htmlFor={SEARCH_INPUT_ID}>
            Search all jobs
          </label>
          <div className={styles.field}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <circle
                cx="7"
                cy="7"
                r="4.25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M10.4 10.4 L13.5 13.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              id={SEARCH_INPUT_ID}
              className={styles.input}
              name="q"
              type="search"
              value={draft}
              maxLength={100}
              placeholder="Search SSC, Railway, UPSSSC, BPSC, Banking…"
              onChange={(event) => {
                if (feedbackRef.current.pendingHref) dirtyDraft.current = true;
                setDraft(event.target.value);
              }}
            />
            {hydrated && draft.length > 0 && (
              <button
                type="button"
                className={styles.clearDraft}
                aria-label="Clear search text"
                onClick={clearDraft}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
        </div>

        <button
          className={`button ${styles.submit}`}
          type="submit"
          aria-busy={pending || undefined}
        >
          <span className={styles.submitLabels}>
            <span aria-hidden={pending || undefined}>Search</span>
            <span aria-hidden={pending ? undefined : true}>
              <span className={styles.spinner} aria-hidden="true" />
              Searching…
            </span>
          </span>
        </button>

        <div className={styles.pillGroup}>
          <span id="qualification-filter-label" className={styles.pillLabel}>
            Qualification
          </span>
          <div
            ref={qualRailRef}
            className={styles.pillRail}
            role="group"
            aria-labelledby="qualification-filter-label"
          >
            {qualificationOptions.map((option) => {
              const isActive = activeQualification === option.value;
              const isPendingPill =
                pending && pendingQualification === option.value;
              return (
                <button
                  key={option.value || 'all'}
                  type="submit"
                  name="qualification"
                  value={option.value}
                  className={styles.pill}
                  aria-pressed={isActive}
                  data-pending={isPendingPill ? 'true' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    submitQualification(option.value);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </Form>
      {children}
      <div
        className={pending ? styles.resultsPending : styles.resultsShell}
        aria-busy={pending || undefined}
        data-search-pending={pending ? 'true' : 'false'}
      >
        {pending && (
          <p className={styles.resultsNote} aria-hidden="true">
            Updating results
          </p>
        )}
        {results}
      </div>
    </>
  );
}

export function JobSortControl({
  filters,
  view,
}: {
  filters: JobFilters;
  view: HomeView;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sortValue, setSortValue] = useState(filters.sort);
  const sortRailRef = useRef<HTMLDivElement>(null);
  const syncedView = useSyncedHomeView(view);

  useEffect(() => {
    setSortValue(filters.sort);
  }, [filters.sort]);

  useEffect(() => {
    scrollActivePill(sortRailRef.current);
  }, [sortValue]);

  return (
    <Form action="/" scroll={false} className={styles.sort}>
      <input type="hidden" name="q" value={filters.q} />
      <input type="hidden" name="qualification" value={filters.qualification} />
      <HomeViewFields view={syncedView} />
      <div className={styles.sortBar}>
        <span className={styles.pillLabel}>Sort</span>
        <div
          ref={sortRailRef}
          className={styles.pillRail}
          role="group"
          aria-label="Sort all jobs"
          aria-busy={isPending}
        >
          {SORT_OPTIONS.map((option) => {
            const active = sortValue === option.value;
            return (
              <button
                key={option.value}
                type="submit"
                name="sort"
                value={option.value}
                className={styles.pill}
                aria-pressed={active}
                disabled={isPending}
                data-pending={isPending && active ? 'true' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  if (sortValue === option.value || isPending) return;
                  setSortValue(option.value);
                  startTransition(() => {
                    const params = homeSearchParams(
                      { ...filters, sort: option.value },
                      1,
                      syncedView,
                    );
                    router.push(`/?${params}#jobs`, { scroll: false });
                  });
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {isPending && (
          <span className={styles.updating} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            Updating…
          </span>
        )}
      </div>
    </Form>
  );
}
