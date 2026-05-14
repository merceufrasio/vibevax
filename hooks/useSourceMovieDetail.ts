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
