import { MetadataModules } from '../../enums';
import { getCacheData } from './cacheData';

/**
 * Result when NATURAL has pixel data as a Value.
 * pixelData may be a single buffer or an array of per-frame data.
 */
export interface CompressedFrameDataValue {
  transferSyntaxUid: string;
  frameOfInterest: number;
  frameNumber: number;
  pixelData: ArrayBufferView | ArrayBufferView[];
}

/**
 * Looks up the frame in the NATURAL pixel data for the given imageId.
 * If the natural instance has PixelData as a Value, returns an object with
 * transferSyntaxUid, frameOfInterest, frameNumber, and pixelData (possibly array).
 * Otherwise returns undefined (caller should "call next" in provider chains).
 */
export function getCompressedFrameData(
  imageId: string,
  frameIndex: number
): CompressedFrameDataValue | undefined {
  const natural = getCacheData(MetadataModules.NATURAL, imageId) as
    | Record<string, unknown>
    | undefined;
  if (!natural) {
    return undefined;
  }

  const pixelDataTag = (natural.PixelData ?? natural.FramePixelData) as
    | { Value?: ArrayBufferView | ArrayBufferView[] }
    | undefined;
  if (!pixelDataTag?.Value) {
    return undefined;
  }

  const transferSyntaxUid =
    (natural.TransferSyntaxUID as string) ??
    ((natural as Record<string, unknown>).TransferSyntaxUID as
      | string
      | undefined);
  if (!transferSyntaxUid) {
    return undefined;
  }

  const frameOfInterest = frameIndex ?? 0;
  const frameNumber = frameOfInterest + 1;

  return {
    transferSyntaxUid,
    frameOfInterest,
    frameNumber,
    pixelData: pixelDataTag.Value,
  };
}

/**
 * Provider-style implementation: if NATURAL has pixel data as a Value for the
 * query (imageId), returns the value including transferSyntaxUid, frame of
 * interest, and frame number. Otherwise calls next.
 */
export function compressedFrameData(
  next: (query: string, data: unknown, options?: unknown) => unknown,
  query: string,
  data: unknown,
  options?: unknown
): CompressedFrameDataValue | unknown {
  const frameIndex =
    typeof (options as { frameIndex?: number })?.frameIndex === 'number'
      ? (options as { frameIndex: number }).frameIndex
      : 0;
  const value = getCompressedFrameData(query, frameIndex);
  if (value) {
    return value;
  }
  return next(query, data, options);
}
