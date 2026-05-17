import { useCallback, useEffect, useState } from "react";

import { useSourceSettings } from "@/hooks/useSourceSettings";
import { SourceRepository } from "@/sources/sourceRepository";
import {
  isSourceChallengeRequiredError,
  subscribeToSourceChallenge,
  type SourceChallengeRequest,
} from "@/sources/sourceChallenge";
import { enrichSourceMovieDetailWithMetadata } from "@/sources/tmdbMetadata";
import type { SourceMovieDetail, StreamResult } from "@/sources/types";

export function useSourceMovieDetail(sourceId?: string, movieId?: string) {
  const { registry } = useSourceSettings();
  const [detail, setDetail] = useState<SourceMovieDetail | null>(null);
  const [repository, setRepository] = useState<SourceRepository | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingStream, setIsResolvingStream] = useState(false);
  const [stream, setStream] = useState<StreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SourceChallengeRequest | null>(null);
  const [pendingEpisodeId, setPendingEpisodeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const plugin = registry?.plugins.find((item) => item.id === sourceId);

    if (!plugin || !movieId) {
      setDetail(null);
      setRepository(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setChallenge(null);

    try {
      const nextRepository = await SourceRepository.create(plugin);
      const nextDetail = await nextRepository.getMovieDetail(movieId);

      setRepository(nextRepository);
      setDetail(nextDetail);

      if (nextDetail) {
        void enrichSourceMovieDetailWithMetadata(nextDetail).then(
          (enrichedDetail) => {
            setDetail((currentDetail) => {
              if (!currentDetail || currentDetail.id !== enrichedDetail.id) {
                return currentDetail;
              }

              return enrichedDetail;
            });
          },
        );
      }
    } catch (loadError) {
      setRepository(null);
      setDetail(null);
      if (isSourceChallengeRequiredError(loadError)) {
        setChallenge(loadError.challenge);
        setError(loadError.message);
      } else {
        setError(String(loadError));
      }
    } finally {
      setIsLoading(false);
    }
  }, [movieId, registry?.plugins, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolveStream = useCallback(
    async (episodeId: string) => {
      if (!repository) {
        return null;
      }

      // Handle 2-step navigation for TV shows: if episodeId is a season/detail URL
      // (starts with "tv/" or "movie/"), fetch detail for that URL to get episodes
      // instead of trying to resolve a stream directly.
      if (episodeId.startsWith("tv/") || episodeId.startsWith("movie/")) {
        setIsResolvingStream(true);
        setError(null);
        try {
          const nextDetail = await repository.getMovieDetail(episodeId);
          if (nextDetail) {
            // For PhimPal: season page episodes have computed IDs that may be wrong.
            // Use GraphQL EpisodesWatch API to get real episode IDs.
            if (nextDetail.servers.length === 1 && nextDetail.servers[0].episodes.length > 0) {
              const firstEp = nextDetail.servers[0].episodes[0];
              // Extract season title ID from the first episode's watch URL
              // Plugin uses format "watch/{seasonId}:{epNum}" as placeholder
              // or "watch/{seasonId}" for simple cases
              const watchIdMatch = firstEp.id?.match(/^watch\/(\d+)/);
              if (watchIdMatch) {
                const estimatedSeasonId = watchIdMatch[1];
                try {
                  const gqlBody = JSON.stringify({
                    operationName: "EpisodesWatch",
                    variables: { parentId: estimatedSeasonId },
                    query: 'query EpisodesWatch($parentId: String) { titles(first: 1200, order: "asc", parentId: $parentId, watchable: true) { nodes { id number nameEn __typename } __typename } }'
                  });
                  const gqlResponse = await fetch("https://legacy.phimpal.com/b/g", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Origin": "https://legacy.phimpal.com",
                      "Referer": "https://legacy.phimpal.com/",
                    },
                    body: gqlBody,
                  });
                  if (gqlResponse.ok) {
                    const gqlData = await gqlResponse.json();
                    const nodes = gqlData?.data?.titles?.nodes;
                    if (Array.isArray(nodes) && nodes.length > 0) {
                      // Replace episodes with real IDs from GraphQL
                      nextDetail.servers[0].episodes = nodes.map((node: { id: string; number: string; nameEn?: string }) => ({
                        id: "watch/" + node.id,
                        slug: "watch/" + node.id,
                        name: node.nameEn
                          ? "Tập " + node.number + ": " + node.nameEn
                          : "Tập " + node.number,
                      }));
                    }
                  }
                } catch {
                  // If GraphQL fails, keep computed IDs as fallback
                }
              }
            }

            setDetail(nextDetail);
            void enrichSourceMovieDetailWithMetadata(nextDetail).then(
              (enrichedDetail) => {
                setDetail((currentDetail) => {
                  if (!currentDetail || currentDetail.id !== enrichedDetail.id) {
                    return currentDetail;
                  }
                  return enrichedDetail;
                });
              },
            );
          }
        } catch (navError) {
          if (isSourceChallengeRequiredError(navError)) {
            setChallenge(navError.challenge);
            setError(navError.message);
          } else {
            setError(String(navError));
          }
        } finally {
          setIsResolvingStream(false);
        }
        return null;
      }

      setIsResolvingStream(true);
      setError(null);
      setChallenge(null);
      setPendingEpisodeId(episodeId);

      try {
        const nextStream = await repository.resolveStream(episodeId);
        setStream(nextStream);
        setPendingEpisodeId(null);
        return nextStream;
      } catch (streamError) {
        setStream(null);
        if (isSourceChallengeRequiredError(streamError)) {
          setChallenge(streamError.challenge);
          setError(streamError.message);
        } else {
          setError(String(streamError));
          setPendingEpisodeId(null);
        }
        return null;
      } finally {
        setIsResolvingStream(false);
      }
    },
    [repository],
  );

  useEffect(() => {
    if (!challenge) {
      return;
    }

    return subscribeToSourceChallenge(challenge.id, (event) => {
      setChallenge(null);

      if (event.status !== "resolved") {
        return;
      }

      if (pendingEpisodeId) {
        void resolveStream(pendingEpisodeId);
        return;
      }

      void load();
    });
  }, [challenge, load, pendingEpisodeId, resolveStream]);

  const clearStream = useCallback(() => setStream(null), []);

  return {
    challenge,
    clearStream,
    detail,
    error,
    isLoading,
    isResolvingStream,
    reload: load,
    resolveStream,
    stream,
  };
}
