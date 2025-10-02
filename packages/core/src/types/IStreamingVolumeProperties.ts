import type { ImageQualityStatus } from '../enums';
import type { IRetrieveConfiguration } from './IRetrieveConfiguration';

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

  /** Progressive rendering configuration */
  progressiveRendering?: boolean | IRetrieveConfiguration;
}

export type { IStreamingVolumeProperties as default };
