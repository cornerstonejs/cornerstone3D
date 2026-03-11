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

/** Keys that indicate paramap-type (parametric map) images for single-buffer frame slicing. */
const PARAMAP_PIXEL_DATA_KEYS = ['FloatPixelData', '7FE00008', '7fe00008'];

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

/**
 * Returns which pixel data key was used in natural, or undefined if none.
 */
function getPixelDataKeyFromNatural(
  natural: Record<string, unknown>
): string | undefined {
  for (const key of PIXEL_DATA_KEYS) {
    const val = natural[key];
    if (
      val !== undefined &&
      val !== null &&
      Array.isArray(val) &&
      val.length > 0
    ) {
      return key;
    }
  }
  return undefined;
}

function isParamapType(natural: Record<string, unknown>): boolean {
  const key = getPixelDataKeyFromNatural(natural);
  return key !== undefined && PARAMAP_PIXEL_DATA_KEYS.includes(key);
}

function asView(buf: ArrayBuffer | ArrayBufferView): ArrayBufferView {
  if (buf instanceof ArrayBuffer) {
    return new Uint8Array(buf);
  }
  return buf as ArrayBufferView;
}

function byteLength(buf: ArrayBuffer | ArrayBufferView): number {
  if (buf instanceof ArrayBuffer) {
    return buf.byteLength;
  }
  return (buf as ArrayBufferView).byteLength;
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
 * When pixelDataTag has one buffer and natural has multiple frames, slice one frame for paramap-type images.
 * Returns undefined if not applicable or split is not even.
 */
function getFramePixelDataFromSingleBuffer(
  pixelDataTag: unknown[],
  frameIndex: number,
  numberOfFrames: number,
  natural: Record<string, unknown>
): CompressedFrameDataMetadata['pixelData'] | undefined {
  if (pixelDataTag.length !== 1 || !isParamapType(natural)) {
    return undefined;
  }
  const buf = pixelDataTag[0];
  if (buf === undefined || buf === null) {
    return undefined;
  }
  const view = asView(buf as ArrayBuffer | ArrayBufferView);
  const totalLength = byteLength(buf as ArrayBuffer | ArrayBufferView);
  if (numberOfFrames <= 0 || totalLength % numberOfFrames !== 0) {
    return undefined;
  }
  const frameSize = totalLength / numberOfFrames;
  const offset = frameIndex * frameSize;
  if (offset + frameSize > totalLength) {
    return undefined;
  }
  console.warn(
    '[compressedFrameData] Splitting single-buffer pixel data by numberOfFrames for paramap-type image; frameIndex=',
    frameIndex,
    ', numberOfFrames=',
    numberOfFrames,
    ', frameSize=',
    frameSize
  );
  const u8 =
    view instanceof Uint8Array
      ? view
      : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return [u8.subarray(offset, offset + frameSize)];
}

/**
 * Builds compressed frame data from a natural instance (pixel data as Value).
 * Returns undefined if natural has no pixel data or transfer syntax.
 * When array length !== numberOfFrames and image is paramap-type, slices a single buffer by frame (with warning).
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
  const numberOfFrames =
    natural.NumberOfFrames != null ? Number(natural.NumberOfFrames) : 1;

  let pixelData: CompressedFrameDataMetadata['pixelData'] | undefined;
  if (pixelDataTag.length === numberOfFrames) {
    pixelData = getFramePixelData(pixelDataTag, frameOfInterest);
  } else {
    pixelData = getFramePixelDataFromSingleBuffer(
      pixelDataTag,
      frameOfInterest,
      numberOfFrames,
      natural
    );
    if (pixelData === undefined) {
      pixelData = getFramePixelData(pixelDataTag, frameOfInterest);
    }
  }
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
