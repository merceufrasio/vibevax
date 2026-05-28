import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";

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
  const router = useRouter();
  const { activeSource } = useSourceSettings();
  const [sections, setSections] = useState<SourceHomeSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SourceChallengeRequest | null>(null);
  const lastChallengeTimeRef = useRef(0);

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
        // Prevent infinite loop: if we just resolved a challenge < 5s ago, don't trigger another
        const now = Date.now();
        if (now - lastChallengeTimeRef.current < 5000) {
          setError("Xác minh Cloudflare không thành công. Vui lòng thử lại.");
          return;
        }
        lastChallengeTimeRef.current = now;

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
        // Delay reload slightly to allow Cloudflare cookies to propagate
        // to the hidden WebView's cookie jar via sharedCookiesEnabled
        setTimeout(() => {
          void reload();
        }, 500);
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
