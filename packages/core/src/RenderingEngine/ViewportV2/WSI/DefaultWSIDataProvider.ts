import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
} from '../../../utilities/WSIUtilities';
import type { LoadedData } from '../ViewportArchitectureTypes';
import { getViewportV2RegisteredData } from '../viewportV2DataSetAccess';
import type {
  WSIDataProvider,
  WSIPayload,
  WSIRegisteredDataSet,
} from './WSIViewportV2Types';

export class DefaultWSIDataProvider implements WSIDataProvider {
  async load(dataId: string): Promise<LoadedData<WSIPayload>> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[WSIViewportV2] No registered WSI dataset metadata for ${dataId}`
      );
    }

    if (dataSet.options.miniNavigationOverlay !== false) {
      addWSIMiniNavigationOverlayCss();
    }

    const loadedData = await loadWSIData({
      imageIds: dataSet.imageIds,
      client: dataSet.options.webClient,
    });
    return {
      id: dataId,
      type: 'wsi',
      imageIds: dataSet.imageIds,
      client: dataSet.options.webClient,
      volumeImages: loadedData.volumeImages,
      metadataDicomweb: loadedData.metadataDicomweb,
      metadata: loadedData.metadata,
      frameOfReferenceUID: loadedData.frameOfReferenceUID,
      imageURISet: loadedData.imageURISet,
    };
  }

  private getDataSet(dataId: string): WSIRegisteredDataSet | undefined {
    const registered = getViewportV2RegisteredData(dataId);

    if (!isWSIRegisteredDataSet(registered)) {
      return;
    }

    return registered;
  }
}

function isWSIRegisteredDataSet(value: unknown): value is WSIRegisteredDataSet {
  if (!isRecord(value) || !Array.isArray(value.imageIds)) {
    return false;
  }

  const options = value.options;

  return (
    value.imageIds.every((imageId) => typeof imageId === 'string') &&
    isRecord(options) &&
    isWSIClientLike(options.webClient)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isWSIClientLike(value: unknown): boolean {
  return isRecord(value) && typeof value.getDICOMwebMetadata === 'function';
}
