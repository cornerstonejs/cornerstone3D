import * as metaData from '../../metaData';
import viewportV2DataSetMetadataProvider from '../../utilities/viewportV2DataSetMetadataProvider';

export function getViewportV2RegisteredData<T = unknown>(
  dataId: string
): T | undefined {
  return metaData.get(
    viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
    dataId
  ) as T | undefined;
}

export function getViewportV2ImageDataSet<T extends { imageIds?: string[] }>(
  dataId: string
): T | undefined {
  const registered = getViewportV2RegisteredData<unknown>(dataId);

  if (Array.isArray(registered)) {
    return {
      imageIds: registered,
    } as T;
  }

  const candidate = registered as T | undefined;

  if (!candidate || typeof candidate !== 'object') {
    return;
  }

  return candidate;
}

export function getViewportV2SourceDataId(dataId: string): string {
  const registered = getViewportV2RegisteredData<unknown>(dataId);

  if (typeof registered === 'string') {
    return registered;
  }

  if (Array.isArray(registered) && registered[0]) {
    return registered[0];
  }

  return dataId;
}
