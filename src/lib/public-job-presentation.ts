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
    // IBPS is an official source in the worker registry but uses a plain .in host.
    return /\.(?:gov|nic|ac|edu|res)\.in$/.test(host) ||
      host === 'ibps.in' ||
      host.endsWith('.ibps.in')
      ? url.href
      : null;
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
          },
        }
      : {}),
  };
}
