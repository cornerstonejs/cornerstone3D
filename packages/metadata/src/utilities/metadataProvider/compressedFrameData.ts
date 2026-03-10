import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';
import type { TypedProvider } from '../../metaData';
import type { CompressedFrameDataMetadata } from '../../types';

/** Known natural keys and hex tags for pixel data (standard and float/paramap). */
const PIXEL_DATA_KEYS = [
  'PixelData',
  'FramePixelData',
  'FloatPixelData',
  '7FE00010',
  '7fe00010',
  '7FE00008',
  '7fe00008',
];

/**
 * Resolves the pixel data array from natural (frames as array of buffers or array of buffer arrays).
 */
function getPixelDataFromNatural(
  natural: Record<string, unknown>
): unknown[] | undefined {
  for (const key of PIXEL_DATA_KEYS) {
    const val = natural[key];
    if (
      val !== undefined &&
      val !== null &&
      Array.isArray(val) &&
      val.length > 0
    ) {
      return val as unknown[];
    }
  }
  return undefined;
}

function asView(buf: ArrayBuffer | ArrayBufferView): ArrayBufferView {
  if (buf instanceof ArrayBuffer) {
    return new Uint8Array(buf);
  }
  return buf as ArrayBufferView;
}

/**
 * Returns the pixel data for the given frame as ArrayBufferView(s) for CompressedFrameDataMetadata.
 * Supports: [ [buf] ] (multiframe), [ [buf1, buf2] ] (single frame, fragments), [ buf ] (single frame, one buffer).
 */
function getFramePixelData(
  pixelDataTag: unknown[],
  frameIndex: number
): CompressedFrameDataMetadata['pixelData'] | undefined {
  const frame = pixelDataTag[frameIndex];
  if (frame === undefined || frame === null) {
    return undefined;
  }
  if (Array.isArray(frame)) {
    return (frame as (ArrayBuffer | ArrayBufferView)[]).map(asView);
  }
  return asView(frame as ArrayBuffer | ArrayBufferView);
}

/**
 * Builds compressed frame data from a natural instance (pixel data as Value).
 * Returns undefined if natural has no pixel data or transfer syntax.
 */
function compressedFrameDataFromNatural(
  natural,
  frameIndex: number
): CompressedFrameDataMetadata | undefined {
  if (!natural) {
    return;
  }

  const pixelDataTag = getPixelDataFromNatural(natural);
  if (!pixelDataTag) {
    return;
  }

  const { TransferSyntaxUID: transferSyntaxUid } = natural;
  if (!transferSyntaxUid) {
    return;
  }

  const frameOfInterest = frameIndex ?? 0;
  const frameNumber = frameOfInterest + 1;
  const pixelData = getFramePixelData(pixelDataTag, frameOfInterest);
  if (pixelData === undefined) {
    return;
  }

  return {
    transferSyntaxUid,
    frameOfInterest,
    frameNumber,
    pixelData,
  };
}

const COMPRESSED_FRAME_DATA_TYPE = MetadataModules.COMPRESSED_FRAME_DATA;

/**
 * Typed provider for COMPRESSED_FRAME_DATA. Gets natural metadata via
 * getMetaData(MetadataModules.NATURAL, query); if it has pixel data as Value,
 * returns { transferSyntaxUid, frameOfInterest, frameNumber, pixelData }.
 * Otherwise calls next.
 */
const compressedFrameDataProvider: TypedProvider = (
  next: (query: string, data: unknown, options?: unknown) => unknown,
  query: string,
  natural,
  options
): CompressedFrameDataMetadata | unknown => {
  const frameIndex = options?.frameIndex ?? 0;
  const value = compressedFrameDataFromNatural(natural, frameIndex);
  if (value) {
    return value;
  }
  return next(
    query,
    natural,

    options
  );
};

export function registerCompressedFrameDataProvider(): void {
  addTypedProvider(COMPRESSED_FRAME_DATA_TYPE, compressedFrameDataProvider);
}
