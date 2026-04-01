import type { IImage } from '../../types';
import type { WSIClientLike } from '../../utilities/WSIUtilities';
import viewportNextDataSetMetadataProvider from '../../utilities/viewportNextDataSetMetadataProvider';

export interface ViewportNextImageDataSet {
  imageIds: string[];
  [key: string]: unknown;
}

export interface ViewportNextPlanarDataSet extends ViewportNextImageDataSet {
  kind?: 'planar';
  initialImageIdIndex?: number;
  volumeId?: string;
  image?: IImage;
  actorUID?: string;
  referencedId?: string;
  representationUID?: string;
}

export interface ViewportNextSourceAliasDataSet {
  kind: 'video' | 'ecg';
  sourceDataId: string;
}

export interface ViewportNextWSIDataSet {
  kind: 'wsi';
  imageIds: string[];
  options: {
    miniNavigationOverlay?: boolean;
    webClient: WSIClientLike;
  };
}

export type ViewportNextRegisteredData =
  | string
  | string[]
  | ViewportNextPlanarDataSet
  | ViewportNextSourceAliasDataSet
  | ViewportNextWSIDataSet;

export function getViewportNextRegisteredData(
  dataId: string
): ViewportNextRegisteredData | undefined {
  return viewportNextDataSetMetadataProvider.get(
    viewportNextDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
    dataId
  ) as ViewportNextRegisteredData | undefined;
}

export function getViewportNextImageDataSet(
  dataId: string
): ViewportNextImageDataSet | undefined {
  const registered = getViewportNextRegisteredData(dataId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isViewportNextImageDataSet(registered)) {
    return;
  }

  return registered;
}

export function getViewportNextPlanarDataSet(
  dataId: string
): ViewportNextPlanarDataSet | undefined {
  const registered = getViewportNextRegisteredData(dataId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isViewportNextImageDataSet(registered)) {
    return;
  }

  if ('kind' in registered && registered.kind && registered.kind !== 'planar') {
    return;
  }

  return registered as ViewportNextPlanarDataSet;
}

export function getViewportNextWSIDataSet(
  dataId: string
): ViewportNextWSIDataSet | undefined {
  const registered = getViewportNextRegisteredData(dataId);

  if (isViewportNextWSIDataSet(registered)) {
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

export function getViewportNextSourceDataId(dataId: string): string {
  const registered = getViewportNextRegisteredData(dataId);

  if (typeof registered === 'string') {
    return registered;
  }

  if (isStringArray(registered) && registered[0]) {
    return registered[0];
  }

  if (isViewportNextSourceAliasDataSet(registered)) {
    return registered.sourceDataId;
  }

  return dataId;
}

export function isViewportNextImageDataSet(
  value: unknown
): value is ViewportNextImageDataSet {
  return isRecord(value) && isStringArray(value.imageIds);
}

export function isViewportNextWSIDataSet(
  value: unknown
): value is ViewportNextWSIDataSet {
  return (
    isRecord(value) &&
    value.kind === 'wsi' &&
    isStringArray(value.imageIds) &&
    isRecord(value.options) &&
    isWSIClientLike(value.options.webClient)
  );
}

export function isViewportNextSourceAliasDataSet(
  value: unknown
): value is ViewportNextSourceAliasDataSet {
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
