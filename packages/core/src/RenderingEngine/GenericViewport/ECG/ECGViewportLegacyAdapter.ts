import type {
  ECGViewportProperties,
  ICamera,
  Point2,
  Point3,
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import { viewportProjection } from '../viewportProjection';
import type { ECGViewState } from './ECGViewportTypes';
import ECGViewport from './ECGViewport';

/**
 * Legacy adapter layer wrapping GenericViewport/ECG to provide backward compatibility
 * with original ECGViewport API calls.
 */
class ECGViewportLegacyAdapter extends ECGViewport {
  /**
   * Loads and displays an ECG dataset given its image ID.
   * @param imageId - Target image ID / display set ID.
   */
  async setEcg(imageId: string): Promise<void> {
    await this.setDisplaySets({ displaySetId: imageId });
  }

  /**
   * Sets the visibility of a specific ECG channel trace by index.
   * @param index - Zero-based index of the target channel.
   * @param visible - True to display the channel, false to hide.
   */
  setChannelVisibility(index: number, visible: boolean): void {
    const waveform = this.getWaveformData();
    const dataId = this.getFirstBinding()?.data.id;

    if (!waveform || !dataId) {
      return;
    }

    const current = this.getDisplaySetPresentation(dataId) || {};
    const nextVisibleChannels = new Set(
      current.visibleChannels || waveform.channels.map((_channel, i) => i)
    );

    if (visible) {
      nextVisibleChannels.add(index);
    } else {
      nextVisibleChannels.delete(index);
    }

    this.setDisplaySetPresentation(dataId, {
      visibleChannels: Array.from(nextVisibleChannels).sort((a, b) => a - b),
    });
  }

  /**
   * Sets presentation properties on the active ECG viewport.
   * @param props - Object containing presentation properties.
   */
  setProperties(props: ECGViewportProperties): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    const updatedProps: Partial<ECGViewportProperties> = {};
    if (props.visibleChannels !== undefined) {
      updatedProps.visibleChannels = props.visibleChannels;
    }
    if (props.sweepSpeed !== undefined) {
      updatedProps.sweepSpeed = props.sweepSpeed;
    }
    if (props.sensitivityMmMv !== undefined) {
      updatedProps.sensitivityMmMv = props.sensitivityMmMv;
    }
    if (props.showAmplitudeLabels !== undefined) {
      updatedProps.showAmplitudeLabels = props.showAmplitudeLabels;
    }
    if (props.layoutType !== undefined) {
      updatedProps.layoutType = props.layoutType;
    }

    this.setDisplaySetPresentation(dataId, updatedProps);
  }

  getProperties(): ECGViewportProperties {
    const dataId = this.getFirstBinding()?.data.id;
    const presentation = dataId
      ? this.getDisplaySetPresentation(dataId)
      : undefined;

    return {
      visibleChannels: presentation?.visibleChannels,
      sweepSpeed: presentation?.sweepSpeed,
      sensitivityMmMv: presentation?.sensitivityMmMv,
      showAmplitudeLabels: presentation?.showAmplitudeLabels,
      layoutType: presentation?.layoutType,
    };
  }

  resetProperties(): void {
    const waveform = this.getWaveformData();
    const dataId = this.getFirstBinding()?.data.id;

    if (!waveform || !dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, {
      visibleChannels: waveform.channels.map((_channel, index) => index),
      sweepSpeed: undefined,
      sensitivityMmMv: undefined,
      showAmplitudeLabels: undefined,
      layoutType: undefined,
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
      ECGViewState,
      ViewPresentation
    >(this, viewPres);

    if (nextViewState) {
      this.setViewState(nextViewState);
    }
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should use
   * `resetViewState`.
   */
  resetCamera(_options?: unknown): boolean {
    return this.resetViewState();
  }

  /**
   * Returns the legacy-compatible camera projection for this viewport.
   *
   * `ICamera` is the legacy camera shape. A next viewport reads `getViewState`,
   * `getZoom` and `getPan` instead, so this method and `setCamera` live on the
   * adapter, as they do in the Video, WSI and Planar families.
   */
  getCamera(): ICamera {
    return this.getCameraForEvent();
  }

  /**
   * Applies legacy camera parameters. The method translates a `parallelScale`
   * or a `scale` into a zoom, and a `focalPoint` into a pan.
   */
  setCamera(cameraPatch: Partial<ICamera>): void {
    if (
      cameraPatch.parallelScale !== undefined &&
      cameraPatch.parallelScale > 0
    ) {
      const currentCamera = this.getCamera();
      if (currentCamera.parallelScale) {
        const ratio = currentCamera.parallelScale / cameraPatch.parallelScale;
        const currentZoom = this.getZoom();
        this.setZoom(currentZoom * ratio);
      }
    } else if (cameraPatch.scale !== undefined && cameraPatch.scale > 0) {
      this.setZoom(cameraPatch.scale);
    }

    if (cameraPatch.focalPoint) {
      this.setFocalPoint(cameraPatch.focalPoint);
    }
  }

  /**
   * Moves the pan so that the requested world point sits at the center of the
   * canvas.
   *
   * The pan is in canvas pixels, and a world point holds a sample index and a
   * raw amplitude. The two spaces have different units, and the vertical
   * directions are opposite, so the conversion goes through `worldToCanvas`.
   * The previous code added a world-space difference straight to the pan, which
   * moved the viewport by the wrong distance and in the wrong vertical
   * direction. `WSIViewportLegacyAdapter.setCamera` uses the same round trip.
   */
  private setFocalPoint(focalPoint: Point3): void {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    const targetCanvas = resolvedView.worldToCanvas(focalPoint);
    const canvasCenter: Point2 = [
      this.canvas.clientWidth / 2,
      this.canvas.clientHeight / 2,
    ];
    const currentPan = this.getPan();

    // Moving the content so that `targetCanvas` reaches the center means a
    // shift of the pan by the canvas-space difference.
    this.setPan([
      currentPan[0] + (canvasCenter[0] - targetCanvas[0]),
      currentPan[1] + (canvasCenter[1] - targetCanvas[1]),
    ]);
  }
}

export default ECGViewportLegacyAdapter;
