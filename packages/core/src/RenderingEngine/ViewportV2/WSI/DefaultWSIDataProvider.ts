import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
} from '../../../utilities/WSIUtilities';
import * as metaData from '../../../metaData';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';
import type { LogicalDataObject } from '../ViewportArchitectureTypes';
import type {
  WSIDataProvider,
  WSIPayload,
  WSIRegisteredDataSet,
} from './WSIViewportV2Types';

export class DefaultWSIDataProvider implements WSIDataProvider {
  private getDataSet(dataId: string): WSIRegisteredDataSet | undefined {
    const registered = metaData.get(
      viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
      dataId
    ) as WSIRegisteredDataSet | undefined;

    if (!registered?.imageIds || !registered?.options?.webClient) {
      return;
    }

    return registered;
  }

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
  }
}
