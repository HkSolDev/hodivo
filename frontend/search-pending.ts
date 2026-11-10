import { readHomeView } from './home-view.js';
import { readJobFilters } from './public-job-filters.js';

// Omitted sort, layout, and page use the same defaults as the server readers.
// Unknown keys such as Next's `_rsc` cache-buster are ignored.
export type SearchNotice =
  | ''
  | 'Searching…'
  | 'Search finished'
  | 'Jobs are temporarily unavailable. Please try again shortly.';

export type SearchOutcome = 'results' | 'unavailable' | 'stale';

export interface SearchFeedback {
  pendingHref: string | null;
  notice: SearchNotice;
}

export type SearchDecision =
  | { kind: 'start'; feedback: SearchFeedback }
  | { kind: 'cancel' }
  | { kind: 'ignore' };

export const idleSearch: SearchFeedback = { pendingHref: null, notice: '' };

const unavailableNotice: SearchNotice =
  'Jobs are temporarily unavailable. Please try again shortly.';

export function searchIdentity(href: string): string {
  const url = new URL(href, 'http://localhost');
  const filters = readJobFilters(url.searchParams);
  const view = readHomeView(url.searchParams);
  if (!filters || !view) return `invalid:${url.pathname}${url.search}`;
  const page = url.searchParams.get('page');
  return [
    filters.q,
    filters.qualification,
    filters.sort,
    view.layout,
    view.recLayout,
    view.recSort,
    view.reviewProfile ?? '',
    page === null ? '1' : page,
  ].join('\0');
}

export function sameSearch(left: string, right: string): boolean {
  return searchIdentity(left) === searchIdentity(right);
}

export function decideSearch(
  current: SearchFeedback,
  href: string,
  locationHref: string,
): SearchDecision {
  if (sameSearch(href, locationHref)) {
    return current.pendingHref ? { kind: 'cancel' } : { kind: 'ignore' };
  }
  if (current.pendingHref && sameSearch(current.pendingHref, href)) {
    return { kind: 'ignore' };
  }
  return {
    kind: 'start',
    feedback: { pendingHref: href, notice: 'Searching…' },
  };
}

export function noteSearchLocation(
  current: SearchFeedback,
  locationHref: string,
  outcome: SearchOutcome = 'results',
): SearchFeedback {
  if (!current.pendingHref) return current;
  if (!sameSearch(current.pendingHref, locationHref)) return idleSearch;
  if (outcome === 'unavailable') {
    return { pendingHref: null, notice: unavailableNotice };
  }
  if (outcome === 'stale') return idleSearch;
  return { pendingHref: null, notice: 'Search finished' };
}

export function interruptSearch(): SearchFeedback {
  return idleSearch;
}
