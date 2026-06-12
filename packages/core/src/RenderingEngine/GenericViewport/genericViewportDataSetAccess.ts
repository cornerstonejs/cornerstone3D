import type { IImage } from '../../types';
import type { WSIClientLike } from '../../utilities/WSIUtilities';
import genericViewportDataSetMetadataProvider from '../../utilities/genericViewportDataSetMetadataProvider';
import type { ViewportDataReference } from './ViewportArchitectureTypes';

export interface GenericViewportImageDataSet {
  imageIds: string[];
  [key: string]: unknown;
}

export interface GenericViewportPlanarDataSet
  extends GenericViewportImageDataSet {
  kind?: 'planar';
  initialImageIdIndex?: number;
  volumeId?: string;
  image?: IImage;
  reference?: ViewportDataReference;
}

export interface GenericViewportSourceAliasDataSet {
  kind: 'video' | 'ecg';
  sourceDataId: string;
}

export interface GenericViewportWSIDataSet {
  kind: 'wsi';
  imageIds: string[];
  options: {
    miniNavigationOverlay?: boolean;
    webClient: WSIClientLike;
  };
}

export type GenericViewportRegisteredData =
  | string
  | string[]
  | GenericViewportPlanarDataSet
  | GenericViewportSourceAliasDataSet
  | GenericViewportWSIDataSet;

export function getGenericViewportRegisteredData(
  dataId: string
): GenericViewportRegisteredData | undefined {
  return genericViewportDataSetMetadataProvider.get(
    genericViewportDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
    dataId
  ) as GenericViewportRegisteredData | undefined;
}

export function getGenericViewportImageDataSet(
  dataId: string
): GenericViewportImageDataSet | undefined {
  const registered = getGenericViewportRegisteredData(dataId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isGenericViewportImageDataSet(registered)) {
    return;
  }

  return registered;
}

export function getGenericViewportPlanarDataSet(
  dataId: string
): GenericViewportPlanarDataSet | undefined {
  const registered = getGenericViewportRegisteredData(dataId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isGenericViewportImageDataSet(registered)) {
    return;
  }

  if ('kind' in registered && registered.kind && registered.kind !== 'planar') {
    return;
  }

  return registered as GenericViewportPlanarDataSet;
}

export function getGenericViewportWSIDataSet(
  dataId: string
): GenericViewportWSIDataSet | undefined {
  const registered = getGenericViewportRegisteredData(dataId);

  if (isGenericViewportWSIDataSet(registered)) {
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
  const registered = getGenericViewportRegisteredData(dataId);

  if (typeof registered === 'string') {
    return registered;
  }

  if (isStringArray(registered) && registered[0]) {
    return registered[0];
  }

  if (isGenericViewportSourceAliasDataSet(registered)) {
    return registered.sourceDataId;
  }

  return dataId;
}

export function isGenericViewportImageDataSet(
  value: unknown
): value is GenericViewportImageDataSet {
  return isRecord(value) && isStringArray(value.imageIds);
}

export function isGenericViewportWSIDataSet(
  value: unknown
): value is GenericViewportWSIDataSet {
  return (
    isRecord(value) &&
    value.kind === 'wsi' &&
    isStringArray(value.imageIds) &&
    isRecord(value.options) &&
    isWSIClientLike(value.options.webClient)
  );
}

export function isGenericViewportSourceAliasDataSet(
  value: unknown
): value is GenericViewportSourceAliasDataSet {
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
