'use client';

import React, { useState } from 'react';
import styles from './youtube-prep-player.module.css';
import type { YoutubeEmbedResource } from './youtube-embed';

const INITIAL_VISIBLE_VIDEOS = 4;

function collectTopics(videos: readonly YoutubeEmbedResource[]): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const video of videos) {
    for (const topic of video.topics) {
      if (!seen.has(topic)) {
        seen.add(topic);
        topics.push(topic);
      }
    }
  }
  return topics;
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PlaylistIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatResourceCount(items: readonly YoutubeEmbedResource[]): string {
  const count = items.length;
  const allPlaylists = items.every((item) => item.kind === 'playlist');
  const allVideos = items.every((item) => item.kind === 'video');
  const noun = allPlaylists ? 'playlist' : allVideos ? 'video' : 'item';
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** Interactive click-to-play YouTube preparation video player and playlist selector. */
export function YoutubePrepPlayer({
  videos,
}: {
  videos: readonly YoutubeEmbedResource[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (videos.length === 0) return null;

  const allTopics = collectTopics(videos);
  const showFilters = videos.length > 1 && allTopics.length >= 2;
  const visibleItems = videos
    .map((video, index) => ({ video, index }))
    .filter(
      ({ video }) => !selectedTopic || video.topics.includes(selectedTopic),
    );
  const visibleVideos = visibleItems.map((item) => item.video);
  const hasOverflow = visibleItems.length > INITIAL_VISIBLE_VIDEOS;
  const displayedItems =
    hasOverflow && !showAll
      ? visibleItems.slice(0, INITIAL_VISIBLE_VIDEOS)
      : visibleItems;
  const current = videos[activeIndex] ?? visibleItems[0]?.video ?? videos[0];

  function handleSelectTopic(topic: string | null) {
    setSelectedTopic(topic);
    setShowAll(false);
    if (!topic) return;
    if (current && current.topics.includes(topic)) return;
    const firstMatch = videos.findIndex((video) =>
      video.topics.includes(topic),
    );
    if (firstMatch >= 0) {
      setActiveIndex(firstMatch);
      setIsPlaying(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {showFilters ? (
        <div className={styles.headerRow}>
          <span className={styles.countBadge}>
            {formatResourceCount(videos)}
          </span>
          <div
            className={styles.filterChips}
            role="group"
            aria-label="Filter videos by topic"
          >
            <button
              type="button"
              className={`${styles.filterChip} ${selectedTopic === null ? styles.filterChipActive : ''}`}
              aria-pressed={selectedTopic === null}
              onClick={() => handleSelectTopic(null)}
            >
              All topics
            </button>
            {allTopics.map((topic) => {
              const active = selectedTopic === topic;
              return (
                <button
                  key={topic}
                  type="button"
                  className={`${styles.filterChip} ${active ? styles.filterChipActive : ''}`}
                  aria-pressed={active}
                  onClick={() => handleSelectTopic(topic)}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={styles.stage}>
        {isPlaying ? (
          <iframe
            key={current.embedUrl}
            className={styles.iframe}
            src={current.embedUrl}
            title={current.title}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : current.thumbnailUrl ? (
          <>
            <img
              src={current.thumbnailUrl}
              alt=""
              className={styles.posterImage}
              loading="lazy"
              decoding="async"
            />
            <div className={styles.posterOverlay} />
            <button
              type="button"
              className={styles.playButton}
              aria-label={`Play ${current.title}`}
              onClick={() => setIsPlaying(true)}
            >
              <PlayIcon />
            </button>
            <span className={styles.stageHint}>Click to play here</span>
          </>
        ) : (
          <div className={styles.playlistPoster}>
            <div className={styles.playlistPosterInner}>
              <span className={styles.playlistEyebrow}>
                <PlaylistIcon />
                <span>YouTube Playlist</span>
              </span>
              <button
                type="button"
                className={`${styles.playButton} ${styles.playButtonInline}`}
                aria-label={`Play ${current.title}`}
                onClick={() => setIsPlaying(true)}
              >
                <PlayIcon />
              </button>
              <p className={styles.playlistPosterTitle}>{current.title}</p>
              <span className={styles.playlistHint}>Click to play here</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.infoBar}>
        <div className={styles.infoMain}>
          {current.topics.length > 0 || current.channel ? (
            <div className={styles.metaRow}>
              {current.topics.map((topic) => (
                <span key={topic} className={styles.topicPill}>
                  {topic}
                </span>
              ))}
              {current.channel ? (
                <span className={styles.channel}>{current.channel}</span>
              ) : null}
            </div>
          ) : null}
          <h3 className={styles.activeTitle}>{current.title}</h3>
        </div>
        <a
          href={current.href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.externalLink}
        >
          Open on YouTube ↗
        </a>
      </div>

      {videos.length > 1 ? (
        <div className={styles.playlistSection}>
          <span className={styles.playlistHeader}>
            Up next · {formatResourceCount(visibleVideos)}
          </span>
          <div className={styles.playlistGrid}>
            {displayedItems.map(({ video, index }) => {
              const isActive = index === activeIndex;
              const itemMeta = [video.channel, video.topics[0]]
                .filter(Boolean)
                .join(' · ');
              return (
                <button
                  key={`${video.href}-${index}`}
                  type="button"
                  aria-pressed={isActive}
                  className={`${styles.playlistItem} ${isActive ? styles.playlistItemActive : ''}`}
                  onClick={() => {
                    setActiveIndex(index);
                    setIsPlaying(true);
                  }}
                >
                  <span className={styles.thumbBox}>
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        className={styles.thumbImage}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className={styles.thumbPlaylistLabel}>
                        Playlist
                      </span>
                    )}
                    {isActive ? (
                      <span className={styles.playingOverlay}>
                        {isPlaying ? 'Playing' : 'Selected'}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>{video.title}</span>
                    {itemMeta ? (
                      <span className={styles.itemMeta}>{itemMeta}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {hasOverflow ? (
            <button
              type="button"
              className={styles.expandButton}
              aria-expanded={showAll}
              onClick={() => setShowAll((prev) => !prev)}
            >
              {showAll
                ? 'Show fewer'
                : `Show all ${formatResourceCount(visibleVideos)} (${visibleItems.length - INITIAL_VISIBLE_VIDEOS} more)`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
