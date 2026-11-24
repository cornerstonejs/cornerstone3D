import { Enums, metaData } from '@cornerstonejs/metadata';
import type { DisplaySetDescriptor } from '../../types/DisplaySetDescriptor';
import type { WSIClientLike } from '../../utilities/WSIUtilities';
import displaySetRegistry from './displaySetRegistry';
import type { WSIDisplaySetDescriptor } from './WSI/WSIViewportTypes';

/** A display set descriptor with the image ids that a viewport loads. */
export interface ImageDisplaySetDescriptor extends DisplaySetDescriptor {
  imageIds: string[];
}

/**
 * Finds the descriptor of `displaySetId` for a data provider. An entry of
 * `displaySetRegistry` wins. Otherwise the descriptor comes from the
 * `DISPLAY_SET` metadata cache, by its display set id.
 */
export function getDisplaySetDescriptor(
  displaySetId: string
): DisplaySetDescriptor | undefined {
  return (
    displaySetRegistry.get(displaySetId) ?? getCachedDisplaySet(displaySetId)
  );
}

/**
 * Reads the `DISPLAY_SET` cache. The cache also holds a display set under
 * each of its image ids, so the id of the display set must equal the key:
 * `displaySetId` (`IDisplaySet`) or `displaySetInstanceUID` (OHIF). The
 * `imageId` of the descriptor is the object to show: `instance.imageId`,
 * else the first underlying image id, else the first image id.
 */
function getCachedDisplaySet(
  displaySetId: string
): DisplaySetDescriptor | undefined {
  const displaySet: unknown = metaData.getTyped(
    Enums.MetadataModules.DISPLAY_SET,
    displaySetId
  );

  if (
    !isRecord(displaySet) ||
    (displaySet.displaySetId !== displaySetId &&
      displaySet.displaySetInstanceUID !== displaySetId)
  ) {
    return;
  }

  const imageIds = isStringArray(displaySet.imageIds)
    ? [...displaySet.imageIds]
    : [];
  const underlyingImageIds = isStringArray(displaySet.underlyingImageIds)
    ? displaySet.underlyingImageIds
    : [];
  const instanceImageId = isRecord(displaySet.instance)
    ? displaySet.instance.imageId
    : undefined;
  const imageId =
    (typeof instanceImageId === 'string' && instanceImageId) ||
    underlyingImageIds[0] ||
    imageIds[0];

  return imageId
    ? {
        imageIds,
        imageId,
        webClient: displaySet.webClient as WSIClientLike | undefined,
      }
    : undefined;
}

/** The descriptor of `displaySetId` when it has image ids. */
export function getImageDisplaySet(
  displaySetId: string
): ImageDisplaySetDescriptor | undefined {
  const descriptor = getDisplaySetDescriptor(displaySetId);

  return isImageDisplaySet(descriptor) ? descriptor : undefined;
}

/**
 * The descriptor of a slide: its image ids and the web client of the
 * descriptor (`options.webClient`, else `webClient`), else the client that
 * the application registered under `WADO_WEB_CLIENT` for the first image id.
 */
export function getWSIDisplaySet(
  displaySetId: string
): WSIDisplaySetDescriptor | undefined {
  const descriptor = getDisplaySetDescriptor(displaySetId);

  if (!isImageDisplaySet(descriptor) || !descriptor.imageIds.length) {
    return;
  }

  const options = isRecord(descriptor.options) ? descriptor.options : {};
  const webClient =
    options.webClient ??
    descriptor.webClient ??
    metaData.get(Enums.MetadataModules.WADO_WEB_CLIENT, descriptor.imageIds[0]);

  if (!isWSIClientLike(webClient)) {
    return;
  }

  return {
    imageIds: descriptor.imageIds,
    options: {
      miniNavigationOverlay: options.miniNavigationOverlay as
        | boolean
        | undefined,
      webClient,
    },
  };
}

/**
 * The image id of the object that a video or an ECG viewport shows: the
 * `imageId` of the descriptor of `displaySetId`, the id itself when no
 * display set is registered under it, and undefined when the descriptor
 * has no `imageId`.
 */
export function getDisplaySetImageId(displaySetId: string): string | undefined {
  const descriptor = getDisplaySetDescriptor(displaySetId);

  if (!descriptor) {
    return displaySetId;
  }

  return typeof descriptor.imageId === 'string' && descriptor.imageId
    ? descriptor.imageId
    : undefined;
}

/**
 * The error of a mount whose display set the viewport cannot load: nothing
 * is registered under the id, or the descriptor has none of the fields that
 * the viewport reads (`needs`).
 */
export function displaySetShapeError(
  viewportName: string,
  displaySetId: string,
  needs: string
): Error {
  if (!getDisplaySetDescriptor(displaySetId)) {
    return new Error(
      `[${viewportName}] No display set is registered under "${displaySetId}": ` +
        `register it with displaySetRegistry.add(displaySetId, descriptor)`
    );
  }

  return new Error(
    `[${viewportName}] The display set "${displaySetId}" has no ${needs}, ` +
      `which a ${viewportName} needs to show it`
  );
}

export function isImageDisplaySet(
  value: unknown
): value is ImageDisplaySetDescriptor {
  return isRecord(value) && isStringArray(value.imageIds);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isWSIClientLike(value: unknown): value is WSIClientLike {
  return isRecord(value) && typeof value.getDICOMwebMetadata === 'function';
}
