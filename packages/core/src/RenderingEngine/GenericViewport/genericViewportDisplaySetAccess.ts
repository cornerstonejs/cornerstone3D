import { Enums, metaData } from '@cornerstonejs/metadata';
import type { IImage } from '../../types';
import type { WSIClientLike } from '../../utilities/WSIUtilities';
import genericViewportDisplaySetMetadataProvider from '../../utilities/genericViewportDisplaySetMetadataProvider';
import type { ViewportDataReference } from './ViewportArchitectureTypes';

export interface GenericViewportImageDisplaySet {
  imageIds: string[];
  [key: string]: unknown;
}

export interface GenericViewportPlanarDisplaySet
  extends GenericViewportImageDisplaySet {
  kind?: 'planar';
  initialImageIdIndex?: number;
  volumeId?: string;
  image?: IImage;
  reference?: ViewportDataReference;
}

/**
 * A display set from the `DISPLAY_SET` metadata cache, in the shape that the
 * data providers read. `sourceDataId` is the image id of the first instance.
 */
export interface GenericViewportCachedDisplaySet
  extends GenericViewportImageDisplaySet {
  sourceDataId: string;
}

export interface GenericViewportSourceAliasDisplaySet {
  kind: 'video' | 'ecg';
  sourceDataId: string;
}

export interface GenericViewportWSIDisplaySet {
  kind: 'wsi';
  imageIds: string[];
  options: {
    miniNavigationOverlay?: boolean;
    webClient: WSIClientLike;
  };
}

export type GenericViewportRegisteredDisplaySet =
  | string
  | string[]
  | GenericViewportPlanarDisplaySet
  | GenericViewportCachedDisplaySet
  | GenericViewportSourceAliasDisplaySet
  | GenericViewportWSIDisplaySet;

/**
 * Finds the display set of `displaySetId` for a data provider. An entry of
 * `genericViewportDisplaySetMetadataProvider` wins. Otherwise the display set
 * comes from the `DISPLAY_SET` metadata cache, by its display set id.
 */
export function getGenericViewportRegisteredDisplaySet(
  displaySetId: string
): GenericViewportRegisteredDisplaySet | undefined {
  return (
    (genericViewportDisplaySetMetadataProvider.get(
      genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
      displaySetId
    ) as GenericViewportRegisteredDisplaySet | undefined) ??
    getCachedDisplaySet(displaySetId)
  );
}

/**
 * Reads the `DISPLAY_SET` cache. The cache also holds a display set under
 * each of its image ids, so the id of the display set must equal the key:
 * `displaySetId` (`IDisplaySet`) or `displaySetInstanceUID` (OHIF).
 */
function getCachedDisplaySet(
  displaySetId: string
): GenericViewportCachedDisplaySet | GenericViewportWSIDisplaySet | undefined {
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
  const { options } = displaySet;

  if (isRecord(options) && isWSIClientLike(options.webClient)) {
    return {
      kind: 'wsi',
      imageIds,
      options: {
        miniNavigationOverlay: options.miniNavigationOverlay as
          | boolean
          | undefined,
        webClient: options.webClient,
      },
    };
  }

  const underlyingImageIds = isStringArray(displaySet.underlyingImageIds)
    ? displaySet.underlyingImageIds
    : [];
  const sourceDataId = underlyingImageIds[0] ?? imageIds[0];

  return sourceDataId ? { imageIds, sourceDataId } : undefined;
}

export function getGenericViewportImageDisplaySet(
  displaySetId: string
): GenericViewportImageDisplaySet | undefined {
  const registered = getGenericViewportRegisteredDisplaySet(displaySetId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isGenericViewportImageDisplaySet(registered)) {
    return;
  }

  return registered;
}

export function getGenericViewportPlanarDisplaySet(
  displaySetId: string
): GenericViewportPlanarDisplaySet | undefined {
  const registered = getGenericViewportRegisteredDisplaySet(displaySetId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isGenericViewportImageDisplaySet(registered)) {
    return;
  }

  if ('kind' in registered && registered.kind && registered.kind !== 'planar') {
    return;
  }

  return registered as GenericViewportPlanarDisplaySet;
}

export function getGenericViewportWSIDisplaySet(
  displaySetId: string
): GenericViewportWSIDisplaySet | undefined {
  const registered = getGenericViewportRegisteredDisplaySet(displaySetId);

  if (isGenericViewportWSIDisplaySet(registered)) {
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
}

export function getGenericViewportSourceDataId(displaySetId: string): string {
  const registered = getGenericViewportRegisteredDisplaySet(displaySetId);

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

export function isGenericViewportImageDisplaySet(
  value: unknown
): value is GenericViewportImageDisplaySet {
  return isRecord(value) && isStringArray(value.imageIds);
}

export function isGenericViewportWSIDisplaySet(
  value: unknown
): value is GenericViewportWSIDisplaySet {
  return (
    isRecord(value) &&
    value.kind === 'wsi' &&
    isStringArray(value.imageIds) &&
    isRecord(value.options) &&
    isWSIClientLike(value.options.webClient)
  );
}

export function isGenericViewportSourceAliasDisplaySet(
  value: unknown
): value is GenericViewportSourceAliasDisplaySet {
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
