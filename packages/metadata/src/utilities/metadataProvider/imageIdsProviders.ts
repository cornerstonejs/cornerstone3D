import { MetadataModules } from '../../enums';
import {
  addTypedProvider,
  getTyped,
  metadataModuleProvider,
  type TypedProvider,
} from '../../metaData';
import {
  getNaturalizedNumber,
  getNaturalizedString,
} from '../getNaturalizedField';

export const FRAME_IMAGE_IDS = MetadataModules.FRAME_IMAGE_IDS;
export const BASE_IMAGE_ID = MetadataModules.BASE_IMAGE_ID;

/** Typed provider signature used by imageId/baseId provider chains. */
export type ImageIdTransformPlugin = TypedProvider;

const BASE_IMAGE_ID_PATH_FILTER_PRIORITY = 9_000;
const BASE_IMAGE_ID_QUERY_FILTER_PRIORITY = 8_000;
const DEFAULT_FRAME_IMAGE_IDS_PRIORITY = 9_000;

function defaultBaseImageIdProvider(_next, imageId: string) {
  return imageId;
}

function framePathToBaseFilter(next, imageId: string, data, options) {
  const baseImageId =
    (next(imageId, data, options) as string | undefined) ?? imageId;
  return baseImageId.replace(/\/frames\/\d+(?=(\?|#|$))/i, '');
}

function frameQueryToBaseFilter(next, imageId: string, data, options) {
  const baseImageId =
    (next(imageId, data, options) as string | undefined) ?? imageId;
  // Strip frame query value from either ?frame=N or &frame=N and normalize separators.
  return baseImageId
    .replace(/([?&])frame=\d+(&?)/i, (_match, separator, hasTrailingAmp) => {
      if (separator === '?' && hasTrailingAmp) {
        return '?';
      }
      return '';
    })
    .replace(/\?$/, '')
    .replace(/\?&/, '?')
    .replace(/&&+/g, '&');
}

function hasPhotometricInterpretation(
  naturalized: Record<string, unknown>
): boolean {
  return !!getNaturalizedString(naturalized, 'PhotometricInterpretation');
}

function addFrameQueryParameter(imageId: string, frameNumber: number) {
  const separator = imageId.includes('?') ? '&' : '?';
  return `${imageId}${separator}frame=${frameNumber}`;
}

function addDicomwebFramePath(
  imageId: string,
  frameNumber: number
): string | undefined {
  const instancesMatch = /\/instances\/[^/]+/i.exec(imageId);
  if (!instancesMatch) {
    return;
  }
  const insertIndex = instancesMatch.index + instancesMatch[0].length;
  return `${imageId.slice(0, insertIndex)}/frames/${frameNumber}${imageId.slice(insertIndex)}`;
}

export function generateFrameImageIdsFromNaturalized(
  baseImageId: string,
  naturalized: Record<string, unknown> | null | undefined
): Set<string> | undefined {
  if (!naturalized) {
    return;
  }

  if (!hasPhotometricInterpretation(naturalized)) {
    return new Set<string>([baseImageId]);
  }

  const frameImageIds = new Set<string>();
  const numberOfFrames = Math.floor(
    getNaturalizedNumber(naturalized, 'NumberOfFrames', 1)
  );
  if (!Number.isFinite(numberOfFrames) || numberOfFrames < 1) {
    return;
  }

  for (let frameNumber = 1; frameNumber <= numberOfFrames; frameNumber++) {
    const framePath = addDicomwebFramePath(baseImageId, frameNumber);
    if (framePath) {
      frameImageIds.add(framePath);
      continue;
    }
    frameImageIds.add(addFrameQueryParameter(baseImageId, frameNumber));
  }

  return frameImageIds;
}

function defaultFrameImageIdsProvider(next, imageId: string, data, options) {
  const naturalized = metadataModuleProvider(
    MetadataModules.NATURALIZED,
    imageId,
    options
  ) as Record<string, unknown> | null | undefined;
  return (
    generateFrameImageIdsFromNaturalized(imageId, naturalized) ||
    next(imageId, data, options)
  );
}

export function registerFrameImageIdsProvider(
  provider: ImageIdTransformPlugin,
  priority = 0
) {
  addTypedProvider(FRAME_IMAGE_IDS, provider, { priority });
}

/**
 * Generic query-normalization filter that rewrites a query to its canonical
 * base imageId before delegating to the remainder of a typed provider chain.
 *
 * Can be plugged into any typed type where frame-specific imageIds should
 * resolve against base-image keyed cache/state.
 */
export function baseImageIdQueryFilter(next, query: string, data, options) {
  const baseImageId = getTyped(MetadataModules.BASE_IMAGE_ID, query, options);
  return next(baseImageId, data, options);
}

/**
 * Registers a transform filter for `frameImageIds`.
 *
 * The filter receives the current imageId and accumulated frame-image-id set,
 * and may return additional imageIds to merge into that set.
 */
export function registerImageIdTransformFilter(
  filter: (
    imageId: string,
    frameImageIds: Set<string>
  ) => Iterable<string> | void,
  priority = 0
) {
  const provider: ImageIdTransformPlugin = (
    next,
    imageId: string,
    data,
    options
  ) => {
    const frameImageIds =
      (next(imageId, data, options) as Set<string> | undefined) ??
      new Set<string>([imageId]);
    const produced = filter(imageId, frameImageIds);
    if (produced) {
      for (const transformedImageId of produced) {
        frameImageIds.add(transformedImageId);
      }
    }
    return frameImageIds;
  };
  registerFrameImageIdsProvider(provider, priority);
}

/**
 * Registers the default imageId providers:
 * - base imageId canonicalization providers
 * - frame imageId expansion providers
 */
export function registerImageIdProviders() {
  addTypedProvider(BASE_IMAGE_ID, defaultBaseImageIdProvider, { priority: 0 });
  addTypedProvider(BASE_IMAGE_ID, framePathToBaseFilter, {
    priority: BASE_IMAGE_ID_PATH_FILTER_PRIORITY,
  });
  addTypedProvider(BASE_IMAGE_ID, frameQueryToBaseFilter, {
    priority: BASE_IMAGE_ID_QUERY_FILTER_PRIORITY,
  });
  addTypedProvider(FRAME_IMAGE_IDS, defaultFrameImageIdsProvider, {
    priority: DEFAULT_FRAME_IMAGE_IDS_PRIORITY,
  });
}

/**
 * Expands each input imageId to its related frame imageIds and applies
 * an update callback once per expanded imageId.
 *
 * Returns the set of unique imageIds that were updated.
 */
export function bulkUpdateImageIds(
  imageIds: Iterable<string>,
  updater: (imageId: string) => void
): Set<string> {
  const updatedImageIds = new Set<string>();
  for (const imageId of imageIds) {
    const frameImageIds = getTyped(MetadataModules.FRAME_IMAGE_IDS, imageId);
    if (!frameImageIds) {
      continue;
    }
    for (const frameImageId of frameImageIds) {
      updater(frameImageId);
      updatedImageIds.add(frameImageId);
    }
  }

  return updatedImageIds;
}
