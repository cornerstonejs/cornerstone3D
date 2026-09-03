import type {
  ImageSetOptions,
  VideoViewportProperties,
  VOIRange,
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import type { Point2 } from '../../../types';
import { viewportProjection } from '../viewportProjection';
import type {
  VideoDataPresentation,
  VideoViewState,
} from './VideoViewportTypes';
import VideoViewport from './VideoViewport';

class VideoViewportLegacyAdapter extends VideoViewport {
  setDataIds(imageIds: string[], options?: ImageSetOptions) {
    const dataId = imageIds[0];

    if (!dataId) {
      return;
    }

    return this.setVideo(
      dataId,
      ((options?.viewReference?.sliceIndex as number) || 0) + 1
    );
  }

  async setVideo(imageId: string, frameNumber?: number): Promise<this> {
    await this.setDisplaySets({ displaySetId: imageId });

    if (typeof frameNumber === 'number') {
      this.setFrameNumber(frameNumber);
    }

    return this;
  }

  setProperties(props: VideoViewportProperties): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    const dataPresentation: Partial<VideoDataPresentation> = {};
    const viewPresentation: ViewPresentation = {};

    if (typeof props.loop === 'boolean') {
      dataPresentation.loop = props.loop;
    }
    if (typeof props.muted === 'boolean') {
      dataPresentation.muted = props.muted;
    }
    if (typeof props.playbackRate === 'number') {
      dataPresentation.playbackRate = props.playbackRate;
    }
    if (props.pan) {
      viewPresentation.pan = props.pan;
    }
    if (props.voiRange) {
      dataPresentation.voiRange = props.voiRange;
    }
    if (props.invert !== undefined) {
      dataPresentation.invert = props.invert;
    }

    if (Object.keys(dataPresentation).length) {
      this.setDisplaySetPresentation(dataId, dataPresentation);
    }

    if (Object.keys(viewPresentation).length) {
      this.setViewPresentation(viewPresentation);
    }
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
      VideoViewState,
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

  getProperties(): VideoViewportProperties {
    const dataId = this.getFirstBinding()?.data.id;
    const dataPresentation = dataId
      ? this.getDisplaySetPresentation(dataId)
      : undefined;
    const viewPresentation = this.getViewPresentation();

    return {
      invert: dataPresentation?.invert,
      loop: dataPresentation?.loop,
      muted: dataPresentation?.muted,
      pan: viewPresentation?.pan,
      playbackRate: dataPresentation?.playbackRate,
      voiRange: dataPresentation?.voiRange,
    };
  }

  resetProperties(): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, {
      invert: false,
      loop: true,
      muted: true,
      playbackRate: 1,
      voiRange: undefined,
    });
    this.setViewPresentation({
      pan: [0, 0] as Point2,
      zoom: 1,
    });
  }

  setVOI(voiRange: VOIRange): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { voiRange });
  }

  setAverageWhite(averageWhite: [number, number, number]): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { averageWhite });
  }
}

export default VideoViewportLegacyAdapter;
