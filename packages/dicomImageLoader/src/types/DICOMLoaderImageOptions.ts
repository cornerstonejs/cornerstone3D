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
    arrayBuffer?: ArrayBufferLike;
    length?: number;
    offset: number;
    /**
     * The size wanted in the destination. Give both rows and columns or
     * neither. They have to keep the aspect ratio of the decoded image, which
     * is scaled to them. Leave out rows, columns and length to get a buffer of
     * the right size for the decoded image.
     */
    rows?: number;
    /** See rows. */
    columns?: number;
  };
  loader?: LoadRequestFunction;
  decodeLevel?: number;
  retrieveOptions?: Types.RetrieveOptions;
  streamingData?: StreamingData;
}
