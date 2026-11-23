/** Public presentation only: stored discovery URLs and original titles stay intact. */
export function cleanPublicJobTitle(title: string): string {
  const brand =
    '(?:Sarkari[ ._-]*Result(?:\\.com)?|My[ ._-]*Sarkari[ ._-]*Naukri(?:\\.com)?|Free[ ._-]*Job[ ._-]*Alert(?:\\.com)?)';
  const cleaned = title
    .replace(new RegExp(`^\\s*${brand}\\s*[:|–—-]\\s*`, 'i'), '')
    .replace(new RegExp(`\\s*[:|–—-]\\s*(?:www\\.)?${brand}\\s*$`, 'i'), '')
    .trim();
  return cleaned || title;
}

export function officialPublicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !['80', '443'].includes(url.port))
    )
      return null;
    const host = url.hostname.toLowerCase();
    if (
      ['sarkariresult.com', 'freejobalert.com', 'mysarkarinaukri.com'].some(
        (blocked) => host === blocked || host.endsWith(`.${blocked}`),
      )
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function safeYoutubeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    const host = url.hostname.toLowerCase();
    const videoId = /^[A-Za-z0-9_-]{11}$/;
    if (host === 'youtu.be' && videoId.test(url.pathname.slice(1)))
      return url.href;
    if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host) &&
      ((url.pathname === '/watch' &&
        videoId.test(url.searchParams.get('v') ?? '')) ||
        (url.pathname === '/playlist' &&
          /^[A-Za-z0-9_-]{10,100}$/.test(url.searchParams.get('list') ?? '')))
    ) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function publicJobPresentation<
  T extends {
    postName: string;
    source: {
      url: string;
      notificationPdfUrl: string | null;
      officialSiteUrl: string | null;
      applyUrl: string | null;
    };
  },
>(job: T): T {
  const reviewed =
    'reviewedDetails' in job &&
    job.reviewedDetails &&
    typeof job.reviewedDetails === 'object' &&
    !Array.isArray(job.reviewedDetails)
      ? (job.reviewedDetails as Record<string, unknown>)
      : null;
  const source = {
    ...job.source,
    // Empty preserves the existing string field; consumers already reject unusable URLs.
    url: officialPublicUrl(job.source.url) ?? '',
    notificationPdfUrl: officialPublicUrl(job.source.notificationPdfUrl),
    officialSiteUrl: officialPublicUrl(job.source.officialSiteUrl),
    applyUrl: officialPublicUrl(job.source.applyUrl),
  };
  const youtubeResources = Array.isArray(reviewed?.youtube_resources)
    ? reviewed.youtube_resources.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const href = safeYoutubeUrl(record.url);
        return href ? [{ ...record, url: href }] : [];
      })
    : undefined;
  return {
    ...job,
    postName: cleanPublicJobTitle(job.postName),
    source,
    ...(reviewed
      ? {
          reviewedDetails: {
            ...reviewed,
            official_site_url: officialPublicUrl(reviewed.official_site_url),
            apply_url: officialPublicUrl(reviewed.apply_url),
            ...(youtubeResources !== undefined
              ? { youtube_resources: youtubeResources }
              : {}),
          },
        }
      : {}),
  };
}
