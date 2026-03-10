import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
} from '../../../utilities/WSIUtilities';
import type { LogicalDataObject } from '../ViewportArchitectureTypes';
import type {
  WSIDataProvider,
  WSIPayload,
  WSIRegisteredDataSet,
} from './WSIViewportV2Types';

export class DefaultWSIDataProvider implements WSIDataProvider {
  private cache = new Map<string, LogicalDataObject>();
  private registeredDataSets = new Map<string, WSIRegisteredDataSet>();

  register(dataId: string, dataSet: WSIRegisteredDataSet): void {
    this.registeredDataSets.set(dataId, dataSet);
    this.cache.delete(dataId);
  }

  async load(dataId: string): Promise<LogicalDataObject> {
    const cached = this.cache.get(dataId);

    if (cached) {
      return cached;
    }

    const dataSet = this.registeredDataSets.get(dataId);

    if (!dataSet) {
      throw new Error(
        `[WSIViewportV2] No registered WSI dataset for ${dataId}`
      );
    }

    if (dataSet.options.miniNavigationOverlay !== false) {
      addWSIMiniNavigationOverlayCss();
    }

    const loadedData = await loadWSIData({
      imageIds: dataSet.imageIds,
      client: dataSet.options.webClient,
    });
    const logicalDataObject: LogicalDataObject<WSIPayload> = {
      id: dataId,
      role: 'image',
      kind: 'wsiData',
      metadata: {
        imageDataMetadata: loadedData.metadata,
        frameOfReferenceUID: loadedData.frameOfReferenceUID,
      },
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

    this.cache.set(dataId, logicalDataObject);
    return logicalDataObject;
  }
}
