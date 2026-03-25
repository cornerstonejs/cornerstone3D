import viewportNextDataSetMetadataProvider from '../../utilities/viewportNextDataSetMetadataProvider';

export interface ViewportNextImageDataSet {
  imageIds: string[];
  [key: string]: unknown;
}

export function getViewportNextRegisteredData(dataId: string): unknown {
  return viewportNextDataSetMetadataProvider.get(
    viewportNextDataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
    dataId
  );
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

export function getViewportNextSourceDataId(dataId: string): string {
  const registered = getViewportNextRegisteredData(dataId);

  if (typeof registered === 'string') {
    return registered;
  }

  if (isStringArray(registered) && registered[0]) {
    return registered[0];
  }

  return dataId;
}

export function isViewportNextImageDataSet(
  value: unknown
): value is ViewportNextImageDataSet {
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
