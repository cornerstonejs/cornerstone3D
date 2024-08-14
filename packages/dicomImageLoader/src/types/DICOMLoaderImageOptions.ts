import type { Types } from '@cornerstonejs/core';
import type { LoadRequestFunction } from './LoadRequestFunction';
import type { StreamingData } from '../imageLoader/wadors/loadImage';

export interface DICOMLoaderImageOptions {
  useRGBA?: boolean;
  allowFloatRendering?: boolean;
  preScale?: {
    enabled: boolean;
    scalingParameters?: Types.ScalingParameters;
  };
  targetBuffer?: {
    type: Types.PixelDataTypedArrayString;
    arrayBuffer: ArrayBufferLike;
    length: number;
    offset: number;
    rows?: number;
    columns?: number;
  };
  loader?: LoadRequestFunction;
  decodeLevel?: number;
  retrieveOptions?: Types.RetrieveOptions;
  streamingData?: StreamingData;
}
