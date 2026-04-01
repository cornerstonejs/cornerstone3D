import type {
  ImageSetOptions,
  VOIRange,
  WSIViewportProperties,
} from '../../../types';
import { MetadataModules } from '../../../enums';
import * as metaData from '../../../metaData';
import viewportNextDataSetMetadataProvider from '../../../utilities/viewportNextDataSetMetadataProvider';
import type { WSIClientLike } from '../../../utilities/WSIUtilities';
import WSIViewportNext from './WSIViewportNext';

class WSIViewportLegacyAdapter extends WSIViewportNext {
  setDataIds(
    imageIds: string[],
    options?: ImageSetOptions & {
      miniNavigationOverlay?: boolean;
      webClient?: WSIClientLike;
    }
  ) {
    const dataId = imageIds[0];

    if (!dataId) {
      return;
    }

    const webClient =
      options?.webClient ||
      metaData.get(MetadataModules.WADO_WEB_CLIENT, dataId);

    if (!webClient) {
      throw new Error(
        `To use setDataIds on WSI data, you must provide metaData.webClient for ${dataId}.`
      );
    }

    viewportNextDataSetMetadataProvider.add(dataId, {
      imageIds,
      kind: 'wsi',
      options: {
        miniNavigationOverlay: options?.miniNavigationOverlay,
        webClient,
      },
    });

    return this.setDataList([{ dataId }]);
  }

  async setWSI(imageIds: string[], client: WSIClientLike) {
    return this.setDataIds(imageIds, {
      webClient: client,
    });
  }

  setProperties(props: WSIViewportProperties): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, {
      voiRange: props.voiRange,
    });
  }

  getProperties(): WSIViewportProperties {
    const dataId = this.getActiveDataId();
    const dataPresentation = dataId
      ? this.getDataPresentation(dataId)
      : undefined;

    return {
      voiRange: dataPresentation?.voiRange,
    };
  }

  resetProperties(): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, {
      averageWhite: undefined,
      voiRange: {
        lower: 0,
        upper: 255,
      },
    });
  }

  setVOI(voiRange: VOIRange): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, { voiRange });
  }

  setAverageWhite(averageWhite: [number, number, number]): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, { averageWhite });
  }
}

export default WSIViewportLegacyAdapter;
