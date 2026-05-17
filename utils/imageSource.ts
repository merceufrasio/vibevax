type ImageSourceValue = {
  uri: string;
  headers?: Record<string, string>;
  cacheKey?: string;
};

export function buildRemoteImageSource(
  uri?: string,
  sourceId?: string,
): ImageSourceValue | undefined {
  if (!uri) {
    return undefined;
  }

  return { uri };
}
