import { ImageQualityStatus } from '../enums';
import { IRetrieveConfiguration } from './IRetrieveConfiguration';

interface IStreamingVolumeProperties {
  /** imageIds of the volume  */
  imageIds: Array<string>;

  /** loading status object for the volume containing loaded/loading statuses */
  loadStatus: {
    loaded: boolean;
    loading: boolean;
    cancelled: boolean;
    cachedFrames: Array<ImageQualityStatus>;
    callbacks: Array<() => void>;
  };

  /** Set to true to use progressive loading, or to a specific loading config */
  progressiveRetrieveConfiguration?: boolean | IRetrieveConfiguration;
}

export default IStreamingVolumeProperties;
