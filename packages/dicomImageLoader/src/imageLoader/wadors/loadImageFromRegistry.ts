import { Enums, metaData } from '@cornerstonejs/core';
import { Enums as MetadataEnums } from '@cornerstonejs/metadata';
import createImage from '../createImage';
import type { DICOMLoaderIImage, DICOMLoaderImageOptions } from '../../types';

const { ImageQualityStatus } = Enums;
const COMPRESSED_FRAME_DATA =
  MetadataEnums.MetadataModules.COMPRESSED_FRAME_DATA;

/** 0-based frame index from a WADO-RS frame imageId (…/frames/N). Defaults to 0. */
function getWadorsFrameIndex(imageId: string): number {
  const match = imageId.match(/\/frames\/(\d+)/);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

const asByteArray = (data) =>
  data instanceof ArrayBuffer ? new Uint8Array(data) : data;

/** Concatenate encapsulated fragments (array) or pass a single buffer through. */
function concatPixelData(pixelData) {
  if (!Array.isArray(pixelData)) {
    return asByteArray(pixelData);
  }
  if (pixelData.length === 0) {
    return undefined;
  }
  if (pixelData.length === 1) {
    return asByteArray(pixelData[0]);
  }

  let totalLength = 0;
  for (const fragment of pixelData) {
    totalLength += asByteArray(fragment).length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const fragment of pixelData) {
    const view = asByteArray(fragment);
    result.set(view, offset);
    offset += view.length;
  }
  return result;
}

/**
 * If a full Part 10 instance has been registered into the NATURALIZED metadata
 * registry (e.g. by a full-instance prefetch via `addDicomPart10Instance` /
 * `prefetchPart10Instance`), serve this WADO-RS frame's compressed pixel data
 * from that registry instead of issuing a per-frame `/frames/N` request.
 *
 * Returns `undefined` when the registry has no data for this frame, in which
 * case the caller must fall back to the normal network path. This keeps the
 * registry the single uniform source: WADO-URI already consults it via
 * `loadImageFromNaturalizedMetadata`, and this makes WADO-RS consult it too.
 *
 * Decode is identical to the network path (same `createImage` + worker
 * decoder); only the origin of the compressed bytes differs.
 */
export function loadImageFromCompressedFrameRegistry(
  imageId: string,
  options: DICOMLoaderImageOptions = {}
): Promise<DICOMLoaderIImage> | undefined {
  const frameIndex = getWadorsFrameIndex(imageId);

  let frameData;
  try {
    frameData = metaData.getTyped(COMPRESSED_FRAME_DATA, imageId, {
      frameIndex,
    });
  } catch (error) {
    // A misbehaving provider must never break normal per-frame loading.
    return undefined;
  }

  if (!frameData?.pixelData) {
    return undefined;
  }

  const { pixelData, transferSyntaxUid } = frameData;
  const concatenated = concatPixelData(pixelData);
  if (!concatenated?.length || !transferSyntaxUid) {
    return undefined;
  }

  const start = Date.now();
  return createImage(imageId, concatenated, transferSyntaxUid, options).then(
    (image) => {
      const out = image as DICOMLoaderIImage;
      out.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
      out.transferSyntaxUID = transferSyntaxUid;
      out.loadTimeInMS = Date.now() - start;
      return out;
    }
  );
}

export default loadImageFromCompressedFrameRegistry;
