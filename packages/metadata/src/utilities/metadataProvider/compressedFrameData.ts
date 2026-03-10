import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';
import type { TypedProvider } from '../../metaData';
import type { CompressedFrameDataMetadata } from '../../types';

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

  const pixelDataTag = natural.PixelData ?? natural.FramePixelData;
  if (!pixelDataTag) {
    console.warn('compressedFrameDataFromNatural: no pixel data');
    return;
  }

  const { TransferSyntaxUID: transferSyntaxUid } = natural;
  if (!transferSyntaxUid) {
    console.warn('compressedFrameDataFromNatural: no transfer syntax', natural);
    return;
  }

  const frameOfInterest = frameIndex ?? 0;
  const frameNumber = frameOfInterest + 1;

  return {
    transferSyntaxUid,
    frameOfInterest,
    frameNumber,
    pixelData: pixelDataTag[frameIndex],
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
