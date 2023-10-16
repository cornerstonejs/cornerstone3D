import { FrameStatus } from '../enums';
import { IRetrieveConfiguration } from './IRetrieveConfiguration';

interface IStreamingVolumeProperties {
  /** imageIds of the volume  */
  imageIds: Array<string>;

  /** loading status object for the volume containing loaded/loading statuses */
  loadStatus: {
    loaded: boolean;
    loading: boolean;
    cancelled: boolean;
    cachedFrames: Array<FrameStatus>;
    callbacks: Array<() => void>;
  };

  /** Information on how to configure the retrieval */
  retrieveConfiguration?: IRetrieveConfiguration;
}

export default IStreamingVolumeProperties;
