import { useCallback, useEffect, useState } from "react";

import { SourceRepository } from "@/sources/sourceRepository";
import {
  isSourceChallengeRequiredError,
  subscribeToSourceChallenge,
  type SourceChallengeRequest,
  updateSourceChallenge,
} from "@/sources/sourceChallenge";
import type { SourceHomeSection } from "@/sources/types";
import { useSourceSettings } from "@/hooks/useSourceSettings";

export function useSourceHome() {
  const { activeSource } = useSourceSettings();
  const [sections, setSections] = useState<SourceHomeSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SourceChallengeRequest | null>(null);

  const reload = useCallback(async () => {
    if (!activeSource) {
      setSections([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    setChallenge(null);
    let sectionUrls: string[] = [];

    try {
      const repository = await SourceRepository.create(activeSource);
      const homeSections = repository.getHomeSections().slice(0, 6);
      const sectionRequests = homeSections.map((section) => ({
        section,
        url: repository.plugin.call(
          "getUrlList",
          section.slug,
          JSON.stringify({
            page: 1,
            limit: 12,
          }),
        ),
      }));
      sectionUrls = sectionRequests.map((entry) => entry.url).filter(Boolean);
      const nextSections = await Promise.all(
        homeSections.map(async (section) => {
          const list = await repository.getList(section.slug, {
            page: 1,
            limit: 12,
          });

          if (__DEV__ && activeSource?.id === "hh3d") {
            console.log("[HH3D:list]", {
              section: section.slug,
              url: sectionUrls.find((entryUrl) => entryUrl.includes(`/${section.slug}/`) || (!section.slug && /\/page\/1\/?$/.test(entryUrl))),
              items: list.items.slice(0, 3).map((item) => ({
                id: item.id,
                title: item.title,
                posterUrl: item.posterUrl,
                backdropUrl: item.backdropUrl,
              })),
            });
          }

          return {
            ...section,
            movies: list.items,
          };
        }),
      );

      setSections(nextSections.filter((section) => section.movies.length > 0));
    } catch (loadError) {
      setSections([]);
      if (isSourceChallengeRequiredError(loadError)) {
        const nextChallenge =
          updateSourceChallenge(loadError.challenge.id, {
            prefetchUrls: Array.from(new Set(sectionUrls)),
          }) ?? loadError.challenge;
        setChallenge(nextChallenge);
        setError(loadError.message);
      } else {
        setError(String(loadError));
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeSource]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!challenge) {
      return;
    }

    return subscribeToSourceChallenge(challenge.id, (event) => {
      if (event.status === "resolved") {
        setChallenge(null);
        void reload();
        return;
      }

      setChallenge(null);
    });
  }, [challenge, reload]);

  return {
    activeSource,
    challenge,
    sections,
    isLoading,
    error,
    reload,
  };
}
