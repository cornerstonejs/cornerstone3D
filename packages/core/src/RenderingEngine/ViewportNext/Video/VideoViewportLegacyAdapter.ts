import type {
  ImageSetOptions,
  VideoViewportProperties,
  VOIRange,
  ViewPresentation,
} from '../../../types';
import type { Point2 } from '../../../types';
import type { VideoDataPresentation } from './VideoViewportNextTypes';
import VideoViewportNext from './VideoViewportNext';

class VideoViewportLegacyAdapter extends VideoViewportNext {
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
    await this.setDataList([{ dataId: imageId }]);

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
      this.setDataPresentation(dataId, dataPresentation);
    }

    if (Object.keys(viewPresentation).length) {
      this.setViewPresentation(viewPresentation);
    }
  }

  getProperties(): VideoViewportProperties {
    const dataId = this.getFirstBinding()?.data.id;
    const dataPresentation = dataId
      ? this.getDataPresentation(dataId)
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

    this.setDataPresentation(dataId, {
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

    this.setDataPresentation(dataId, { voiRange });
  }

  setAverageWhite(averageWhite: [number, number, number]): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, { averageWhite });
  }
}

export default VideoViewportLegacyAdapter;
