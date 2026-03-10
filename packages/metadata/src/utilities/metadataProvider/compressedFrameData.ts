import { MetadataModules } from '../../enums';
import { addTypedProvider, getMetaData } from '../../metaData';
import type { TypedProvider } from '../../metaData';
import type { CompressedFrameDataMetadata } from '../../types';

/**
 * Builds compressed frame data from a natural instance (pixel data as Value).
 * Returns undefined if natural has no pixel data or transfer syntax.
 */
function compressedFrameDataFromNatural(
  natural: Record<string, unknown> | undefined,
  frameIndex: number
): CompressedFrameDataMetadata | undefined {
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
  _data: unknown,
  options?: unknown
): CompressedFrameDataMetadata | unknown => {
  const frameIndex =
    typeof (options as { frameIndex?: number })?.frameIndex === 'number'
      ? (options as { frameIndex: number }).frameIndex
      : 0;
  const natural = getMetaData(MetadataModules.NATURAL, query) as
    | Record<string, unknown>
    | undefined;
  const value = compressedFrameDataFromNatural(natural, frameIndex);
  if (value) {
    return value;
  }
  return next(query, _data, options);
};

export function registerCompressedFrameDataProvider(): void {
  addTypedProvider(COMPRESSED_FRAME_DATA_TYPE, compressedFrameDataProvider);
}
