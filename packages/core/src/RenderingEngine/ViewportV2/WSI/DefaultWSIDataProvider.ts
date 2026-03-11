import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
} from '../../../utilities/WSIUtilities';
import type { LogicalDataObject } from '../ViewportArchitectureTypes';
import { getViewportV2RegisteredData } from '../viewportV2DataSetAccess';
import type {
  WSIDataProvider,
  WSIPayload,
  WSIRegisteredDataSet,
} from './WSIViewportV2Types';

export class DefaultWSIDataProvider implements WSIDataProvider {
  async load(dataId: string): Promise<LogicalDataObject<WSIPayload>> {
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
      payload: {
        imageIds: dataSet.imageIds,
        client: dataSet.options.webClient,
        volumeImages: loadedData.volumeImages,
        metadataDicomweb: loadedData.metadataDicomweb,
        metadata: loadedData.metadata,
        frameOfReferenceUID: loadedData.frameOfReferenceUID,
        imageURISet: loadedData.imageURISet,
      },
    };
  }

  private getDataSet(dataId: string): WSIRegisteredDataSet | undefined {
    const registered =
      getViewportV2RegisteredData<WSIRegisteredDataSet>(dataId);

    if (!registered?.imageIds || !registered?.options?.webClient) {
      return;
    }

    return registered;
  }
}
