import type {
  ICamera,
  ImageSetOptions,
  Point2,
  Point3,
  VOIRange,
  WSIViewportProperties,
} from '../../../types';
import { MetadataModules } from '../../../enums';
import * as metaData from '../../../metaData';
import viewportNextDataSetMetadataProvider from '../../../utilities/viewportNextDataSetMetadataProvider';
import type { WSIClientLike } from '../../../utilities/WSIUtilities';
import { canvasToIndexForWSI } from './wsiTransformUtils';
import WSIViewport from './WSIViewport';
import type { WSICamera, WSIViewState } from './WSIViewportTypes';

class WSIViewportLegacyAdapter extends WSIViewport {
  setCamera(cameraPatch: Partial<WSICamera>): void {
    const viewStatePatch: Partial<WSIViewState> = {};

    if (typeof cameraPatch.zoom === 'number') {
      viewStatePatch.zoom = cameraPatch.zoom;
    }
    if (cameraPatch.centerIndex) {
      viewStatePatch.centerIndex = [
        cameraPatch.centerIndex[0],
        cameraPatch.centerIndex[1],
      ];
    }
    if (typeof cameraPatch.rotation === 'number') {
      viewStatePatch.rotation = cameraPatch.rotation;
    }
    if (typeof cameraPatch.resolution === 'number') {
      viewStatePatch.resolution = cameraPatch.resolution;
    }

    if (typeof cameraPatch.parallelScale === 'number') {
      const spacing = this.getImageData()?.spacing?.[0];

      if (typeof spacing === 'number' && spacing > 0) {
        const worldToCanvasRatio =
          this.element.clientHeight /
          Math.max(cameraPatch.parallelScale, 0.001);

        viewStatePatch.resolution = 1 / spacing / worldToCanvasRatio;
      }
    }

    if (cameraPatch.focalPoint) {
      const view = this.getView();

      if (view) {
        const newCanvas = this.worldToCanvas(cameraPatch.focalPoint as Point3);
        const newIndex = canvasToIndexForWSI({
          canvasPos: newCanvas as Point2,
          canvasWidth: this.element.clientWidth,
          canvasHeight: this.element.clientHeight,
          view,
        });

        viewStatePatch.centerIndex = [newIndex[0], newIndex[1]];
      }
    }

    if (Object.keys(viewStatePatch).length) {
      this.setViewState(viewStatePatch);
    }
  }

  getCamera(): WSIViewState & ICamera {
    return {
      ...this.getViewState(),
      ...this.getCameraForEvent(),
    } as WSIViewState & ICamera;
  }

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
