export type YoutubeResourceInput = {
  title?: string | null;
  url?: string | null;
  channel?: string | null;
  topics?: string[] | null;
};

export type YoutubeEmbedResource = {
  title: string;
  href: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  kind: 'video' | 'playlist';
  channel: string | null;
  topics: string[];
};

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
]);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;

function buildVideoEmbed(href: string, id: string) {
  return {
    href,
    kind: 'video' as const,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

function buildPlaylistEmbed(href: string, id: string) {
  return {
    href,
    kind: 'playlist' as const,
    embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${id}&autoplay=1&rel=0`,
    thumbnailUrl: null,
  };
}

/** Validates an external YouTube URL and derives its privacy-enhanced embed target. */
export function parseYoutubeUrl(value: unknown): {
  href: string;
  kind: 'video' | 'playlist';
  embedUrl: string;
  thumbnailUrl: string | null;
} | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1);
      return VIDEO_ID_PATTERN.test(id) ? buildVideoEmbed(url.href, id) : null;
    }
    if (!YOUTUBE_HOSTS.has(host)) return null;
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v') ?? '';
      return VIDEO_ID_PATTERN.test(id) ? buildVideoEmbed(url.href, id) : null;
    }
    if (url.pathname === '/playlist') {
      const id = url.searchParams.get('list') ?? '';
      return PLAYLIST_ID_PATTERN.test(id)
        ? buildPlaylistEmbed(url.href, id)
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Normalizes raw reviewed YouTube resources and drops any invalid entries. */
export function normalizeYoutubeResources(
  resources: readonly YoutubeResourceInput[] | null | undefined,
): YoutubeEmbedResource[] {
  if (!Array.isArray(resources)) return [];
  const normalized: YoutubeEmbedResource[] = [];
  for (const item of resources) {
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) continue;
    const parsed = parseYoutubeUrl(item.url);
    if (!parsed) continue;
    const channel =
      typeof item.channel === 'string' && item.channel.trim()
        ? item.channel.trim()
        : null;
    const seenTopics = new Set<string>();
    const topics: string[] = [];
    if (Array.isArray(item.topics)) {
      for (const topic of item.topics) {
        if (typeof topic !== 'string') continue;
        const trimmed = topic.trim();
        if (trimmed && !seenTopics.has(trimmed)) {
          seenTopics.add(trimmed);
          topics.push(trimmed);
        }
      }
    }
    normalized.push({
      title,
      ...parsed,
      channel,
      topics,
    });
  }
  return normalized;
}
