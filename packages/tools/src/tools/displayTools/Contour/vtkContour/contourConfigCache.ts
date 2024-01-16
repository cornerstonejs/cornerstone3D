type ConfigCache = {
  segmentsHidden: Set<number>;
  outlineWidthActive: number;
  visibility: boolean;
};

/**
 * Config cache is used to store the config for a given segmentation
 * representation. This is used to avoid having to recompute the config
 * every time the user changes the active segment, and also for performance
 * reasons.
 */
const configCachePerSegmentationRepresentationUID = new Map();

export function getConfigCache(
  segmentationRepresentationUID: string
): ConfigCache {
  return configCachePerSegmentationRepresentationUID.get(
    segmentationRepresentationUID
  );
}

export function setConfigCache(
  segmentationRepresentationUID: string,
  config: ConfigCache
) {
  configCachePerSegmentationRepresentationUID.set(
    segmentationRepresentationUID,
    config
  );
}

export function deleteConfigCache(segmentationRepresentationUID: string) {
  configCachePerSegmentationRepresentationUID.delete(
    segmentationRepresentationUID
  );
}
