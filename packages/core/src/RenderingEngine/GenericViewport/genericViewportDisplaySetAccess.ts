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
  | GenericViewportSourceAliasDisplaySet
  | GenericViewportWSIDisplaySet;

export function getGenericViewportRegisteredDisplaySet(
  dataId: string
): GenericViewportRegisteredDisplaySet | undefined {
  return genericViewportDisplaySetMetadataProvider.get(
    genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
    dataId
  ) as GenericViewportRegisteredDisplaySet | undefined;
}

export function getGenericViewportImageDisplaySet(
  dataId: string
): GenericViewportImageDisplaySet | undefined {
  const registered = getGenericViewportRegisteredDisplaySet(dataId);

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
  dataId: string
): GenericViewportPlanarDisplaySet | undefined {
  const registered = getGenericViewportRegisteredDisplaySet(dataId);

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
  dataId: string
): GenericViewportWSIDisplaySet | undefined {
  const registered = getGenericViewportRegisteredDisplaySet(dataId);

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

export function getGenericViewportSourceDataId(dataId: string): string {
  const registered = getGenericViewportRegisteredDisplaySet(dataId);

  if (typeof registered === 'string') {
    return registered;
  }

  if (isStringArray(registered) && registered[0]) {
    return registered[0];
  }

  if (isGenericViewportSourceAliasDisplaySet(registered)) {
    return registered.sourceDataId;
  }

  return dataId;
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
