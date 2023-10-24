import { Types, Enums } from '@cornerstonejs/core';

export default interface ImageLoadRequests {
  callLoadImage: (
    imageId: any,
    imageIdIndex: any,
    options: any
  ) => Promise<void>;
  imageId: string;
  imageIdIndex: number;
  options: {
    targetBuffer: {
      arrayBuffer: SharedArrayBuffer;
      offset: number;
      length: number;
      type: any;
    };
    skipCreateImage: boolean;
    preScale: {
      enabled: boolean;
      scalingParameters: Types.ScalingParameters;
    };
    transferPixelData: boolean;
  };
  priority: number;
  requestType: Enums.RequestType;
  additionalDetails: {
    volumeId: string;
  };
}
