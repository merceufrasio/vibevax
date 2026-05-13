import { useCallback, useEffect, useState } from "react";

import { SourceRepository } from "@/sources/sourceRepository";
import type { SourceHomeSection } from "@/sources/types";
import { useSourceSettings } from "@/hooks/useSourceSettings";

export function useSourceHome() {
  const { activeSource } = useSourceSettings();
  const [sections, setSections] = useState<SourceHomeSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!activeSource) {
      setSections([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const repository = await SourceRepository.create(activeSource);
      const homeSections = repository.getHomeSections().slice(0, 6);
      const nextSections = await Promise.all(
        homeSections.map(async (section) => {
          const list = await repository.getList(section.slug, {
            page: 1,
            limit: 12,
          });

          return {
            ...section,
            movies: list.items,
          };
        }),
      );

      setSections(nextSections.filter((section) => section.movies.length > 0));
    } catch (loadError) {
      setSections([]);
      setError(String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [activeSource]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    activeSource,
    sections,
    isLoading,
    error,
    reload,
  };
}
