import viewportV2DataSetMetadataProvider from '../../utilities/viewportV2DataSetMetadataProvider';

export interface ViewportV2ImageDataSet {
  imageIds: string[];
  [key: string]: unknown;
}

export function getViewportV2RegisteredData(dataId: string): unknown {
  return viewportV2DataSetMetadataProvider.get(
    viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
    dataId
  );
}

export function getViewportV2ImageDataSet(
  dataId: string
): ViewportV2ImageDataSet | undefined {
  const registered = getViewportV2RegisteredData(dataId);

  if (isStringArray(registered)) {
    return {
      imageIds: registered,
    };
  }

  if (!isViewportV2ImageDataSet(registered)) {
    return;
  }

  return registered;
}

export function getViewportV2SourceDataId(dataId: string): string {
  const registered = getViewportV2RegisteredData(dataId);

  if (typeof registered === 'string') {
    return registered;
  }

  if (isStringArray(registered) && registered[0]) {
    return registered[0];
  }

  return dataId;
}

export function isViewportV2ImageDataSet(
  value: unknown
): value is ViewportV2ImageDataSet {
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
