import { VolumeTimePoints } from './IImageVolume';

interface IStreamingVolumeProperties {
  /** imageIds of the volume  */
  imageIds?: Array<string>;
  /** time points data for 4D volumes  */
  timePointsData?: VolumeTimePoints;

  /** loading status object for the volume containing loaded/loading statuses */
  loadStatus: {
    loaded: boolean;
    loading: boolean;
    cachedFrames: Array<boolean>;
    callbacks: Array<() => void>;
  };
}

export default IStreamingVolumeProperties;
