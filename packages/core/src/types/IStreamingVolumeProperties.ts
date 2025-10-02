import type { ImageQualityStatus } from '../enums';

interface IStreamingVolumeProperties {
  /** imageIds of the volume  */
  imageIds: string[];

  /** loading status object for the volume containing loaded/loading statuses */
  loadStatus: {
    loaded: boolean;
    loading: boolean;
    cancelled: boolean;
    cachedFrames: ImageQualityStatus[];
    callbacks: (() => void)[];
  };
}

export type { IStreamingVolumeProperties as default };
