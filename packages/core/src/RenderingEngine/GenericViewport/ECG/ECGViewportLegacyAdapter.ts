import type {
  ECGViewportProperties,
  ICamera,
  Point2,
  Point3,
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import { viewportProjection } from '../viewportProjection';
import type {
  ECGViewState,
  ECGResetViewStateOptions,
} from './ECGViewportTypes';
import ECGViewport from './ECGViewport';

/** Legacy properties that move the trace, and so belong to the view state. */
const LEGACY_VIEW_STATE_PROPERTIES = [
  'visibleChannels',
  'sweepSpeed',
  'sensitivityMmMv',
  'traceLayout',
] as const;

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

    if (!waveform) {
      return;
    }

    const nextVisibleChannels = new Set(
      this.getViewState().visibleChannels ||
        waveform.channels.map((_channel, i) => i)
    );

    if (visible) {
      nextVisibleChannels.add(index);
    } else {
      nextVisibleChannels.delete(index);
    }

    this.setViewState({
      visibleChannels: Array.from(nextVisibleChannels).sort((a, b) => a - b),
    });
  }

  /**
   * Sets the legacy ECG properties. The layout options go to the view state,
   * and `showAmplitudeLabels` goes to the data presentation. The deprecated
   * `layoutType` sets `traceLayout`.
   * @param props - Object containing presentation properties.
   */
  setProperties(props: ECGViewportProperties = {}): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    const viewStatePatch: Partial<ECGViewState> = {};
    LEGACY_VIEW_STATE_PROPERTIES.forEach((key) => {
      if (props[key] !== undefined) {
        (viewStatePatch as Record<string, unknown>)[key] = props[key];
      }
    });

    if (props.traceLayout === undefined && props.layoutType !== undefined) {
      viewStatePatch.traceLayout = props.layoutType;
    }

    if (Object.keys(viewStatePatch).length) {
      this.setViewState(viewStatePatch);
    }

    if (props.showAmplitudeLabels !== undefined) {
      this.setDisplaySetPresentation(dataId, {
        showAmplitudeLabels: props.showAmplitudeLabels,
      });
    }
  }

  getProperties(): ECGViewportProperties {
    const dataId = this.getFirstBinding()?.data.id;
    const presentation = dataId
      ? this.getDisplaySetPresentation(dataId)
      : undefined;
    const viewState = this.getViewState();

    return {
      visibleChannels: viewState.visibleChannels,
      sweepSpeed: viewState.sweepSpeed,
      sensitivityMmMv: viewState.sensitivityMmMv,
      showAmplitudeLabels: presentation?.showAmplitudeLabels,
      traceLayout: viewState.traceLayout,
    };
  }

  resetProperties(): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setViewState({
      visibleChannels: undefined,
      sweepSpeed: undefined,
      sensitivityMmMv: undefined,
      traceLayout: undefined,
    });
    this.setDisplaySetPresentation(dataId, {
      showAmplitudeLabels: undefined,
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
  resetCamera(options?: ECGResetViewStateOptions): boolean {
    return this.resetViewState(options);
  }

  /**
   * Returns the legacy-compatible camera projection for this viewport.
   *
   * `ICamera` is the legacy camera shape. A next viewport reads `getViewState`,
   * `getZoom` and `getPan` instead, so this method and `setCamera` live on the
   * adapter, as they do in the Video, WSI and Planar families.
   */
  getCamera(): ECGViewState & ICamera {
    return {
      ...this.getViewState(),
      ...this.getCameraForEvent(),
    } as ECGViewState & ICamera;
  }

  /**
   * Applies legacy camera parameters. The method translates a `parallelScale`
   * or a `scale` into a zoom, and a `focalPoint` into a pan.
   * Also supports applying timeRange or valueRange viewState updates.
   */
  setCamera(cameraPatch: Partial<ECGViewState & ICamera>): void {
    if (cameraPatch.timeRange || cameraPatch.valueRange) {
      const nextViewState: Partial<ECGViewState> = {};
      if (cameraPatch.timeRange) {
        nextViewState.timeRange = cameraPatch.timeRange;
      }
      if (cameraPatch.valueRange) {
        nextViewState.valueRange = cameraPatch.valueRange;
      }
      this.setViewState(nextViewState);
    }

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
   * directions are opposite, so the conversion goes through `worldToCanvas`,
   * as in `WSIViewportLegacyAdapter.setCamera`.
   */
  private setFocalPoint(focalPoint: Point3): void {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    const z = Math.round(focalPoint[2]);
    const matchesLayout = resolvedView.channelLayouts.some(
      (item) => item.leadIndex === z
    );

    if (!matchesLayout) {
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
