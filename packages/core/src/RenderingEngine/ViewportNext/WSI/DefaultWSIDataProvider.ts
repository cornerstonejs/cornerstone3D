import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
} from '../../../utilities/WSIUtilities';
import type { LoadedData } from '../ViewportArchitectureTypes';
import { getViewportNextWSIDataSet } from '../viewportNextDataSetAccess';
import type {
  WSIDataProvider,
  WSIPayload,
  WSIRegisteredDataSet,
} from './WSIViewportNextTypes';

export class DefaultWSIDataProvider implements WSIDataProvider {
  async load(dataId: string): Promise<LoadedData<WSIPayload>> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[WSIViewportNext] No registered WSI dataset metadata for ${dataId}`
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
    const registered = getViewportNextWSIDataSet(dataId);

    if (!registered) {
      return;
    }

    return registered;
  }
}
