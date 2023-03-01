import { Types } from '@cornerstonejs/core';
import { CornerstoneWadoLoaderLoadRequestFunction } from 'dicomImageLoader/src/shared/types/load-request-function';

export interface CornerstoneLoadImageOptions {
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
  loader?: CornerstoneWadoLoaderLoadRequestFunction;
}
