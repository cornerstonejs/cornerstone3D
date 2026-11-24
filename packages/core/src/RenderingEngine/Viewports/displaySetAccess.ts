import { displaySetRegistry, Enums, metaData } from '@cornerstonejs/metadata';
import type { DisplaySetDescriptor } from '../../types/DisplaySetDescriptor';
import type { WSIClientLike } from '../../utilities/WSIUtilities';
import type { WSIDisplaySetDescriptor } from './WSI/WSIViewportTypes';

/** A display set descriptor with the image ids that a viewport loads. */
export interface ImageDisplaySetDescriptor extends DisplaySetDescriptor {
  imageIds: string[];
}

/** The descriptor that `displaySetRegistry` holds under `displaySetId`. */
export function getDisplaySetDescriptor(
  displaySetId: string
): DisplaySetDescriptor | undefined {
  return displaySetRegistry.get(displaySetId);
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
 * `imageId` of the descriptor of `displaySetId`, else the image id of its
 * `instance` (an OHIF display set), else its first underlying image id (an
 * `IDisplaySet`). The id itself when no display set is registered under it,
 * and undefined when the descriptor has none of these.
 */
export function getDisplaySetImageId(displaySetId: string): string | undefined {
  const descriptor = getDisplaySetDescriptor(displaySetId);

  if (!descriptor) {
    return displaySetId;
  }

  const instanceImageId = isRecord(descriptor.instance)
    ? descriptor.instance.imageId
    : undefined;
  const underlyingImageIds = isStringArray(descriptor.underlyingImageIds)
    ? descriptor.underlyingImageIds
    : [];

  return [descriptor.imageId, instanceImageId, underlyingImageIds[0]].find(
    (imageId): imageId is string =>
      typeof imageId === 'string' && imageId.length > 0
  );
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
