import { Types } from '@cornerstonejs/core';
import { LoadRequestFunction } from './LoadRequestFunction';

export interface DICOMLoaderImageOptions {
  useRGBA?: boolean;
  skipCreateImage?: boolean;
  preScale?: {
    enabled: boolean;
    scalingParameters?: Types.ScalingParameters;
  };
  targetBuffer?: {
    type: 'Uint8Array' | 'Uint16Array' | 'Int16Array' | 'Float32Array';
    arrayBuffer: ArrayBufferLike;
    length: number;
    offset: number;
  };
  isSharedArrayBuffer?: boolean;
  loader?: LoadRequestFunction;
}
