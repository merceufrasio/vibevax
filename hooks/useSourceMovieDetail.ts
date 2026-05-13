import { useCallback, useEffect, useState } from "react";

import { useSourceSettings } from "@/hooks/useSourceSettings";
import { SourceRepository } from "@/sources/sourceRepository";
import type { SourceMovieDetail, StreamResult } from "@/sources/types";

export function useSourceMovieDetail(sourceId?: string, movieId?: string) {
  const { registry } = useSourceSettings();
  const [detail, setDetail] = useState<SourceMovieDetail | null>(null);
  const [repository, setRepository] = useState<SourceRepository | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingStream, setIsResolvingStream] = useState(false);
  const [stream, setStream] = useState<StreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const plugin = registry?.plugins.find((item) => item.id === sourceId);

    if (!plugin || !movieId) {
      setDetail(null);
      setRepository(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextRepository = await SourceRepository.create(plugin);
      const nextDetail = await nextRepository.getMovieDetail(movieId);

      setRepository(nextRepository);
      setDetail(nextDetail);
    } catch (loadError) {
      setRepository(null);
      setDetail(null);
      setError(String(loadError));
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

      try {
        const nextStream = await repository.resolveStream(episodeId);
        setStream(nextStream);
        return nextStream;
      } catch (streamError) {
        setStream(null);
        setError(String(streamError));
        return null;
      } finally {
        setIsResolvingStream(false);
      }
    },
    [repository],
  );

    const clearStream = useCallback(() => setStream(null), []);

    return {
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
