import type {
  ECGViewportProperties,
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import { viewportProjection } from '../viewportProjection';
import type { ECGViewState } from './ECGViewportTypes';
import ECGViewport from './ECGViewport';

class ECGViewportLegacyAdapter extends ECGViewport {
  async setEcg(imageId: string): Promise<void> {
    await this.setDisplaySets({ displaySetId: imageId });
  }

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

  setProperties(props: ECGViewportProperties): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, {
      visibleChannels: props.visibleChannels,
      sweepSpeed: props.sweepSpeed,
      sensitivityMmMv: props.sensitivityMmMv,
      showAmplitudeLabels: props.showAmplitudeLabels,
      layoutType: props.layoutType,
    });
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
}

export default ECGViewportLegacyAdapter;
