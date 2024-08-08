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
      type: string;
      rows: number;
      columns: number;
    };
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
