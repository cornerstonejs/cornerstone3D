import { Enums, metaData } from '@cornerstonejs/metadata';
import type { IImage } from '../../types';
import type { WSIClientLike } from '../../utilities/WSIUtilities';
import genericViewportDisplaySetMetadataProvider from '../../utilities/genericViewportDisplaySetMetadataProvider';
import type { ViewportDataReference } from './ViewportArchitectureTypes';

export interface ImageDisplaySet {
  imageIds: string[];
  [key: string]: unknown;
}

export interface PlanarDisplaySet extends ImageDisplaySet {
  kind?: 'planar';
  initialImageIdIndex?: number;
  volumeId?: string;
  image?: IImage;
  reference?: ViewportDataReference;
}

/**
 * A display set from the `DISPLAY_SET` metadata cache, in the shape that the
 * data providers read. `sourceDataId` is the image id of the object to show:
 * `instance.imageId`, else the first underlying image id, else the first image
 * id. `webClient` is the WSI client that the display set carries, if any.
 */
export interface CachedDisplaySet extends ImageDisplaySet {
  sourceDataId: string;
  webClient?: unknown;
}

export interface SourceAliasDisplaySet {
  kind: 'video' | 'ecg';
  sourceDataId: string;
}

export interface WSIDisplaySet {
  kind: 'wsi';
  imageIds: string[];
  options: {
    miniNavigationOverlay?: boolean;
    webClient: WSIClientLike;
  };
}

export type RegisteredDisplaySet =
  | string
  | string[]
  | PlanarDisplaySet
  | CachedDisplaySet
  | SourceAliasDisplaySet
  | WSIDisplaySet;

/**
 * Finds the display set of `displaySetId` for a data provider. An entry of
 * `genericViewportDisplaySetMetadataProvider` wins. Otherwise the display set
 * comes from the `DISPLAY_SET` metadata cache, by its display set id.
 */
export function getRegisteredDisplaySet(
  displaySetId: string
): RegisteredDisplaySet | undefined {
  return (
    (genericViewportDisplaySetMetadataProvider.get(
      genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
      displaySetId
    ) as RegisteredDisplaySet | undefined) ?? getCachedDisplaySet(displaySetId)
  );
}

/**
 * Reads the `DISPLAY_SET` cache. The cache also holds a display set under
 * each of its image ids, so the id of the display set must equal the key:
 * `displaySetId` (`IDisplaySet`) or `displaySetInstanceUID` (OHIF).
 */
function getCachedDisplaySet(
  displaySetId: string
): CachedDisplaySet | undefined {
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
  // `instance` is the object to show for a video, an ECG or a SEG.
  const instanceImageId = isRecord(displaySet.instance)
    ? displaySet.instance.imageId
    : undefined;
  const sourceDataId =
    (typeof instanceImageId === 'string' && instanceImageId) ||
    underlyingImageIds[0] ||
    imageIds[0];

  return sourceDataId
    ? { imageIds, sourceDataId, webClient: displaySet.webClient }
    : undefined;
}

export function getImageDisplaySet(
  displaySetId: string
): ImageDisplaySet | undefined {
  const registered = getRegisteredDisplaySet(displaySetId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isImageDisplaySet(registered)) {
    return;
  }

  return registered;
}

export function getPlanarDisplaySet(
  displaySetId: string
): PlanarDisplaySet | undefined {
  const registered = getRegisteredDisplaySet(displaySetId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isImageDisplaySet(registered)) {
    return;
  }

  if ('kind' in registered && registered.kind && registered.kind !== 'planar') {
    return;
  }

  return registered as PlanarDisplaySet;
}

export function getWSIDisplaySet(
  displaySetId: string
): WSIDisplaySet | undefined {
  const registered = getRegisteredDisplaySet(displaySetId);

  if (isWSIDisplaySet(registered)) {
    return registered;
  }

  if (
    isRecord(registered) &&
    isStringArray(registered.imageIds) &&
    isRecord(registered.options) &&
    isWSIClientLike(registered.options.webClient)
  ) {
    return {
      imageIds: registered.imageIds,
      kind: 'wsi',
      options: {
        miniNavigationOverlay: registered.options.miniNavigationOverlay as
          | boolean
          | undefined,
        webClient: registered.options.webClient as WSIClientLike,
      },
    };
  }

  // A cached display set: its own client, else the client that the
  // application registered under `WADO_WEB_CLIENT` for the first image id.
  if (
    isRecord(registered) &&
    typeof registered.sourceDataId === 'string' &&
    isStringArray(registered.imageIds) &&
    registered.imageIds.length
  ) {
    const webClient =
      registered.webClient ??
      metaData.get(
        Enums.MetadataModules.WADO_WEB_CLIENT,
        registered.imageIds[0]
      );

    if (isWSIClientLike(webClient)) {
      return {
        kind: 'wsi',
        imageIds: registered.imageIds,
        options: { webClient },
      };
    }
  }
}

export function getDisplaySetSourceDataId(displaySetId: string): string {
  const registered = getRegisteredDisplaySet(displaySetId);

  if (typeof registered === 'string') {
    return registered;
  }

  if (isStringArray(registered) && registered[0]) {
    return registered[0];
  }

  if (isRecord(registered) && typeof registered.sourceDataId === 'string') {
    return registered.sourceDataId;
  }

  return displaySetId;
}

export function isImageDisplaySet(value: unknown): value is ImageDisplaySet {
  return isRecord(value) && isStringArray(value.imageIds);
}

export function isWSIDisplaySet(value: unknown): value is WSIDisplaySet {
  return (
    isRecord(value) &&
    value.kind === 'wsi' &&
    isStringArray(value.imageIds) &&
    isRecord(value.options) &&
    isWSIClientLike(value.options.webClient)
  );
}

export function isSourceAliasDisplaySet(
  value: unknown
): value is SourceAliasDisplaySet {
  return (
    isRecord(value) &&
    (value.kind === 'video' || value.kind === 'ecg') &&
    typeof value.sourceDataId === 'string'
  );
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
