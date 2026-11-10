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
import Link from 'next/link';
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
import { HomeViewFields } from './home-layout-controls';
import styles from './job-search-controls.module.css';
import {
  JOB_QUALIFICATIONS,
  type JobFilters,
} from '@/frontend/public-job-filters';

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const SEARCH_INPUT_ID = 'job-search-q';

function formSearchHref(form: HTMLFormElement): string {
  const url = new URL('/', window.location.origin);
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string') url.searchParams.append(name, value);
  }
  return `${url.pathname}${url.search}`;
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
  const [mobileExpanded, setMobileExpanded] = useState<boolean | null>(null);
  const [draft, setDraft] = useState(filters.q);
  const [feedback, setFeedback] = useState<SearchFeedback>(idleSearch);
  const feedbackRef = useRef(feedback);
  const dirtyDraft = useRef(false);
  const restoreDraft = useRef(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const pending = feedback.pendingHref !== null;
  const hasQualification = Boolean(filters.qualification);
  const activeCount = hasQualification ? 1 : 0;
  const isExpanded = mobileExpanded ?? hasQualification;
  feedbackRef.current = feedback;

  useEffect(() => {
    if (pending && !restoreDraft.current) return;
    if (restoreDraft.current || !dirtyDraft.current) setDraft(filters.q);
    dirtyDraft.current = false;
    restoreDraft.current = false;
  }, [filters.q, pending]);

  useEffect(() => {
    setFeedback((current) =>
      noteSearchLocation(current, window.location.href, outcome),
    );
  }, [filters, view, page, outcome]);

  useEffect(() => {
    const onPop = () => {
      restoreDraft.current = true;
      feedbackRef.current = idleSearch;
      setFeedback(interruptSearch());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // String-action <Form> navigates outside a transition, so useFormStatus
    // stays idle. preventDefault and push inside our own bookkeeping.
    event.preventDefault();
    submitHref(formSearchHref(event.currentTarget));
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
        <HomeViewFields view={view} />
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
              placeholder="Exam, role or organization"
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

        <div
          className={`${styles.mobileFilterToggle}${hydrated ? ` ${styles.enhanced}` : ''}`}
        >
          <button
            type="button"
            className={styles.filterButton}
            aria-expanded={isExpanded}
            aria-controls="secondary-filters"
            onClick={() => setMobileExpanded(!isExpanded)}
          >
            <span>Filters{activeCount > 0 ? ` (${activeCount})` : ''}</span>
            <span className={styles.filterChevron} aria-hidden="true">
              {isExpanded ? '▴' : '▾'}
            </span>
          </button>
        </div>

        <div
          id="secondary-filters"
          className={`${styles.secondaryFilters}${hydrated ? ` ${styles.enhanced}` : ''}${isExpanded ? ` ${styles.isExpanded}` : ''}`}
        >
          <label className={styles.qualificationLabel}>
            Qualification
            <select
              key={filters.qualification}
              className={styles.select}
              name="qualification"
              defaultValue={filters.qualification}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="">All qualifications</option>
              {JOB_QUALIFICATIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="ITI" disabled>
                ITI — not available yet
              </option>
            </select>
          </label>
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
      </Form>
      {(filters.q || filters.qualification) && (
        <div className={styles.feedback}>
          <p>Searching all jobs. Clear your search to return to browsing.</p>
          <Link
            className={styles.clear}
            href={`/?${homeSearchParams({ ...filters, q: '', qualification: '' }, 1, view)}`}
          >
            Clear search and filter
          </Link>
        </div>
      )}
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

  useEffect(() => {
    setSortValue(filters.sort);
  }, [filters.sort]);

  return (
    <Form action="/" scroll={false} className={styles.sort}>
      <input type="hidden" name="q" value={filters.q} />
      <input type="hidden" name="qualification" value={filters.qualification} />
      <HomeViewFields view={view} />
      <label>
        Sort
        <select
          className={styles.sortSelect}
          name="sort"
          aria-label="Sort all jobs"
          aria-busy={isPending}
          disabled={isPending}
          value={sortValue}
          onChange={(event) => {
            const nextSort = event.target.value as JobFilters['sort'];
            setSortValue(nextSort);
            startTransition(() => {
              const params = homeSearchParams(
                { ...filters, sort: nextSort },
                1,
                view,
              );
              router.push(`/?${params}#jobs`, { scroll: false });
            });
          }}
        >
          <option value="newest">Newest</option>
          <option value="soonest">Deadline: soonest first</option>
          <option value="furthest">Deadline: furthest first</option>
        </select>
        {isPending && (
          <span className={styles.updating} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            Updating…
          </span>
        )}
      </label>
      <noscript>
        <button className="button button-secondary" type="submit">
          Apply sort
        </button>
      </noscript>
    </Form>
  );
}
