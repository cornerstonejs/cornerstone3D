import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
} from '../../../utilities/WSIUtilities';
import type { LoadedData } from '../ViewportArchitectureTypes';
import { displaySetShapeError, getWSIDisplaySet } from '../displaySetAccess';
import type { WSIDataProvider, WSIPayload } from './WSIViewportTypes';

export class DefaultWSIDataProvider implements WSIDataProvider {
  async load(displaySetId: string): Promise<LoadedData<WSIPayload>> {
    const dataSet = getWSIDisplaySet(displaySetId);

    if (!dataSet) {
      throw displaySetShapeError(
        'WSIViewport',
        displaySetId,
        'imageIds with a web client (options.webClient, webClient or the WADO_WEB_CLIENT metadata of its first image id)'
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
      id: displaySetId,
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
}
