export function formatRating(value: number) {
  return value.toFixed(1);
}

export function formatRuntime(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}

export function formatEpisodes(currentEpisode: number, totalEpisodes: number) {
  return `${currentEpisode}/${totalEpisodes}`;
}

export function formatRelativeTime(isoString: string, locale: "vi" | "en" = "vi") {
  const deltaInHours = Math.round(
    (Date.now() - new Date(isoString).getTime()) / (1000 * 60 * 60),
  );

  if (deltaInHours <= 1) {
    return locale === "vi" ? "Vừa xong" : "Just now";
  }

  if (deltaInHours < 24) {
    return locale === "vi"
      ? `${deltaInHours} giờ trước`
      : `${deltaInHours}h ago`;
  }

  const deltaInDays = Math.round(deltaInHours / 24);

  return locale === "vi"
    ? `${deltaInDays} ngày trước`
    : `${deltaInDays}d ago`;
}
