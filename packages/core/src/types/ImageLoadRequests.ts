import type { RequestType } from '../enums';
import type { ScalingParameters } from './ScalingParameters';

export default interface ImageLoadRequests {
  callLoadImage: (
    imageId: string,
    imageIdIndex: number,
    options: unknown
  ) => Promise<void>;
  imageId: string;
  imageIdIndex: number;
  options: {
    targetBuffer: {
      type: string;
      rows: number;
      columns: number;
    };
    preScale: {
      enabled: boolean;
      scalingParameters: ScalingParameters;
    };
    transferPixelData: boolean;
  };
  priority: number;
  requestType: RequestType;
  additionalDetails: {
    volumeId: string;
  };
}
