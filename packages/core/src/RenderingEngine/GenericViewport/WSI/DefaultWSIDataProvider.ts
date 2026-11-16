import { MetadataModules } from '../../../enums';
import * as metaData from '../../../metaData';
import {
  addWSIMiniNavigationOverlayCss,
  loadWSIData,
  type WSIClientLike,
} from '../../../utilities/WSIUtilities';
import type { LoadedData } from '../ViewportArchitectureTypes';
import {
  getGenericViewportRegisteredDisplaySet,
  getGenericViewportWSIDisplaySet,
} from '../genericViewportDisplaySetAccess';
import type {
  WSIDataProvider,
  WSIPayload,
  WSIRegisteredDataSet,
} from './WSIViewportTypes';

/**
 * The web client of a slide: the given one, else the one that the
 * application registered under the `WADO_WEB_CLIENT` metadata for the first
 * image id, as on the legacy WSI viewport.
 */
export function getWSIWebClient(
  imageId: string,
  webClient?: WSIClientLike
): WSIClientLike | undefined {
  return (
    webClient ||
    (metaData.get(MetadataModules.WADO_WEB_CLIENT, imageId) as
      | WSIClientLike
      | undefined)
  );
}

export class DefaultWSIDataProvider implements WSIDataProvider {
  async load(dataId: string): Promise<LoadedData<WSIPayload>> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[WSIViewport] No registered WSI dataset metadata for ${dataId}`
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

  /**
   * The registered WSI data set. A `wsi` entry without a web client takes
   * the client of the `WADO_WEB_CLIENT` metadata of its first image id.
   */
  private getDataSet(dataId: string): WSIRegisteredDataSet | undefined {
    const registered = getGenericViewportWSIDisplaySet(dataId);

    if (registered) {
      return registered;
    }

    const entry = getGenericViewportRegisteredDisplaySet(dataId) as
      | Partial<WSIRegisteredDataSet & { kind: string }>
      | undefined;

    if (entry?.kind !== 'wsi' || !entry.imageIds?.length) {
      return;
    }

    const webClient = getWSIWebClient(entry.imageIds[0]);

    if (!webClient) {
      return;
    }

    return {
      imageIds: entry.imageIds,
      options: {
        miniNavigationOverlay: entry.options?.miniNavigationOverlay,
        webClient,
      },
    };
  }
}
