import type {
  ICamera,
  ImageSetOptions,
  Point2,
  Point3,
  VOIRange,
  ViewPresentation,
  ViewPresentationSelector,
  WSIViewportProperties,
} from '../../../types';
import { MetadataModules } from '../../../enums';
import * as metaData from '../../../metaData';
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import type { WSIClientLike } from '../../../utilities/WSIUtilities';
import { viewportProjection } from '../viewportProjection';
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

    genericViewportDisplaySetMetadataProvider.add(dataId, {
      imageIds,
      kind: 'wsi',
      options: {
        miniNavigationOverlay: options?.miniNavigationOverlay,
        webClient,
      },
    });

    return this.setDisplaySets({ displaySetId: dataId });
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

    this.setDisplaySetPresentation(dataId, {
      voiRange: props.voiRange,
    });
  }

  getProperties(): WSIViewportProperties {
    const dataId = this.getActiveDataId();
    const dataPresentation = dataId
      ? this.getDisplaySetPresentation(dataId)
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

    this.setDisplaySetPresentation(dataId, {
      averageWhite: undefined,
      voiRange: {
        lower: 0,
        upper: 255,
      },
    });
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should read
   * presentation through `viewportProjection.getPresentation`.
   */
  getViewPresentation(
    selector?: ViewPresentationSelector
  ): ViewPresentation | undefined {
    return viewportProjection.getPresentation<ViewPresentation>(this, {
      selector,
    });
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should use
   * viewport projection to derive view state, then call `setViewState`.
   */
  setViewPresentation(viewPres?: ViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const nextViewState = viewportProjection.withPresentation<
      WSIViewState,
      ViewPresentation
    >(this, viewPres);

    if (nextViewState) {
      this.setViewState(nextViewState);
    }
  }

  /**
   * Compatibility wrapper for legacy callers. Direct Next viewports should use
   * `resetViewState`.
   */
  resetCamera(): boolean {
    return this.resetViewState();
  }

  setVOI(voiRange: VOIRange): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { voiRange });
  }

  setAverageWhite(averageWhite: [number, number, number]): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { averageWhite });
  }
}

export default WSIViewportLegacyAdapter;
