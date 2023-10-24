import { Types, Enums } from '@cornerstonejs/core';

export default interface ImageLoadRequests {
  callLoadImage: (
    imageId: string,
    imageIdIndex: number,
    options: any
  ) => Promise<void>;
  imageId: string;
  imageIdIndex: number;
  options: {
    targetBuffer: {
      arrayBuffer: SharedArrayBuffer | undefined;
      offset: number;
      length: number;
      type: string;
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
