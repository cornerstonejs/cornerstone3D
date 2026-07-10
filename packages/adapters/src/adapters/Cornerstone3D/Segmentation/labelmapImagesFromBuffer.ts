import { eventTarget, imageLoader, triggerEvent } from '@cornerstonejs/core';
import { utilities as cstUtils } from '@cornerstonejs/tools';
import { data as dcmjsData, normalizers } from 'dcmjs';
import ndarray from 'ndarray';
import checkOrientation from '../../helpers/checkOrientation';
import {
  createDecodeImageDataFromMultiframe,
  getSegNumberOfFramesFromDataset,
  unpackBinaryFrameFromPacked,
} from '../encodePixelData';
import {
  alignPixelDataWithSourceData,
  calculateCentroid,
  findReferenceSourceImageId,
  getImageIdOfSourceImageBySourceImageSequence,
  getSegmentIndex,
  getSegmentMetadata,
  getValidOrientations,
  readFromUnpackedChunks,
} from '../../Cornerstone/Segmentation_4X';
import { compactMergeSegmentDataWithoutInformationLoss } from './compactMergeSegData';
import { normalizeSharedFunctionalGroupsSequence } from './perFrameFunctionalGroups';
import { Events } from '../../enums';

const { DicomMessage, DicomMetaDictionary } = dcmjsData;
const { Normalizer } = normalizers;
const LABELMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.7';
const BUFFER_SEG_IMAGE_ID = 'cornerstone-adapters-buffer-seg:0';

/** Frame-agnostic imageId for SOP UID → imageId maps (multiframe stacks). */
function stripFrameQualifiersFromImageId(imageId: string): string {
  if (!imageId) {
    return imageId;
  }

  if (imageId.includes('/frames/')) {
    return imageId.replace(/\/frames\/\d+.*$/, '');
  }

  return imageId.split('&frame=')[0].split('?frame=')[0];
}

function prepareSegMultiframeMetadata(multiframe: Record<string, unknown>) {
  normalizeSharedFunctionalGroupsSequence(multiframe);

  const perFrame = multiframe.PerFrameFunctionalGroupsSequence;

  if (perFrame && !Array.isArray(perFrame)) {
    multiframe.PerFrameFunctionalGroupsSequence = [perFrame];
  }
}

function getFrameNumberFromImageId(imageId: string): number | undefined {
  const frameQueryMatch = imageId.match(/(?:&|\?)frame=(\d+)/);
  if (frameQueryMatch) {
    return Number(frameQueryMatch[1]);
  }

  const wadorsFrameMatch = imageId.match(/\/frames\/(\d+)/);
  if (wadorsFrameMatch) {
    return Number(wadorsFrameMatch[1]);
  }

  return undefined;
}

/**
 * Determines whether a FRACTIONAL SEG is "pseudo-binary" — i.e. every decoded
 * pixel is either 0 or `MaximumFractionalValue` — and can therefore be processed
 * exactly like a BINARY SEG (matching 4.x behavior). Returns false for genuinely
 * fractional data (intermediate probability values), which is unsupported, and
 * false when `MaximumFractionalValue` is missing/non-numeric.
 */
function isPseudoBinaryFractional(
  pixelData: ArrayLike<number>,
  maximumFractionalValue: unknown
): boolean {
  const max = Number(maximumFractionalValue);
  if (!Number.isFinite(max)) {
    return false;
  }
  for (let i = 0; i < pixelData.length; i++) {
    const value = pixelData[i];
    if (value !== 0 && value !== max) {
      return false;
    }
  }
  return true;
}

function isPseudoBinaryFractionalFromChunks(
  chunks: ArrayLike<number>[],
  maximumFractionalValue: unknown
): boolean {
  for (const chunk of chunks) {
    if (!isPseudoBinaryFractional(chunk, maximumFractionalValue)) {
      return false;
    }
  }
  return true;
}

/**
 * Builds a `SOP Instance UID → source imageId` lookup for a referenced (source)
 * stack, so the per-frame loop does not have to call `metadataProvider.get()`
 * for every imageId repeatedly.
 *
 * The stored value is the *frame-qualified* imageId (e.g. `…?frame=1`,
 * `…/frames/1`), NOT a frame-stripped base. A multiframe source series shares a
 * single SOP Instance UID across all of its frames, so the first frame's fully
 * qualified id is stored and {@link getImageIdOfSourceImageBySourceImageSequence}
 * rewrites the frame number from each SEG frame's `ReferencedFrameNumber`.
 * Storing a stripped base breaks that rewrite for the `?frame=`/`&frame=`
 * schemes (wadouri / dicomfile) — the regex has nothing to replace, so every SEG
 * frame collapses onto frame 1 and overlapping segments are dropped. (wadors is
 * unaffected because the base is re-appended with `/frames/N`.)
 */
function buildSopUIDImageIdIndexMap(referencedImageIds, metadataProvider) {
  return referencedImageIds.reduce((acc, imageId) => {
    const { sopInstanceUID } =
      metadataProvider.get('generalImageModule', imageId) ?? {};

    if (!sopInstanceUID) {
      return acc;
    }

    if (!acc[sopInstanceUID]) {
      acc[sopInstanceUID] = imageId;
    }

    return acc;
  }, {});
}

/**
 * Maps a resolved reference imageId (possibly built from stripped SOP base + frame)
 * to an imageId that exists in the OHIF/Cornerstone stack and imageIdMaps.
 */
function resolveStackImageId(
  imageId: string | undefined,
  referencedImageIds: string[],
  metadataProvider?
): string | undefined {
  if (!imageId) {
    // Skip, don't guess: without a resolved reference imageId we cannot know
    // which slice this frame belongs to. Positional (by-index) mapping would
    // silently paint the frame onto the wrong slice for sparse or reordered
    // SEGs, corrupting the segmentation. The caller skips this frame instead.
    return undefined;
  }

  if (referencedImageIds.includes(imageId)) {
    return imageId;
  }

  const strippedTarget = stripFrameQualifiersFromImageId(imageId);
  const targetFrame = getFrameNumberFromImageId(imageId);

  for (const refId of referencedImageIds) {
    if (stripFrameQualifiersFromImageId(refId) !== strippedTarget) {
      continue;
    }

    if (targetFrame === undefined) {
      return refId;
    }

    const refFrame = getFrameNumberFromImageId(refId) ?? 1;

    if (refFrame === targetFrame) {
      return refId;
    }
  }

  if (metadataProvider?.get) {
    const { sopInstanceUID } =
      metadataProvider.get('generalImageModule', imageId) || {};

    if (sopInstanceUID) {
      for (const refId of referencedImageIds) {
        const refSop = metadataProvider.get(
          'generalImageModule',
          refId
        )?.sopInstanceUID;

        if (refSop !== sopInstanceUID) {
          continue;
        }

        if (targetFrame === undefined) {
          return refId;
        }

        const refFrame = getFrameNumberFromImageId(refId) ?? 1;

        if (refFrame === targetFrame) {
          return refId;
        }
      }
    }
  }

  // No identity match (imageId, stripped SOP + frame, or SOP UID) was found.
  // Skip, don't guess by position — see resolveStackImageId's early return.
  return undefined;
}

function ensureImageIdMapsEntry(
  imageId: string,
  referencedImageIds: string[],
  imageIdMaps: {
    indices: Record<string, number>;
    metadata: Record<string, Record<string, unknown>>;
  },
  metadataProvider
) {
  const stackImageId = resolveStackImageId(
    imageId,
    referencedImageIds,
    metadataProvider
  );

  if (!stackImageId) {
    return undefined;
  }

  if (imageIdMaps.indices[stackImageId] === undefined) {
    const index = referencedImageIds.indexOf(stackImageId);

    if (index === -1) {
      return undefined;
    }

    imageIdMaps.indices[stackImageId] = index;
    imageIdMaps.metadata[stackImageId] =
      imageIdMaps.metadata[stackImageId] ||
      metadataProvider.get('instance', stackImageId);
  }

  return stackImageId;
}

function chunkPixelData(
  pixelData,
  options: { maxBytesPerChunk?: number } = {}
) {
  const { maxBytesPerChunk = Number.POSITIVE_INFINITY } = options;

  if (pixelData.length <= maxBytesPerChunk) {
    return [pixelData];
  }

  const chunks = [];
  for (let offset = 0; offset < pixelData.length; offset += maxBytesPerChunk) {
    chunks.push(pixelData.subarray(offset, offset + maxBytesPerChunk));
  }

  return chunks;
}

function normalizeDecodedPixelData(pixelData) {
  if (Array.isArray(pixelData)) {
    if (pixelData.length === 1) {
      return normalizeDecodedPixelData(pixelData[0]);
    }

    const hasUint16Frame = pixelData.some(
      (frame) => frame instanceof Uint16Array
    );

    if (hasUint16Frame) {
      // Promote any non-16-bit frame to Uint16Array by VALUE (each segment
      // index copied, length preserved) — NOT a byte reinterpret. Decoded
      // frames arrive from the imageLoader as typed arrays matching their true
      // bit depth, so a Uint8Array frame holds genuine 8-bit segment indices
      // that must keep their values when widened. A `new Uint16Array(buffer)`
      // byte reinterpretation would halve the length and corrupt the indices.
      const normalizedFrames = pixelData.map((frame) =>
        frame instanceof Uint16Array ? frame : new Uint16Array(frame)
      );
      const totalLength = normalizedFrames.reduce(
        (acc, frame) => acc + frame.length,
        0
      );
      const combined = new Uint16Array(totalLength);
      let offset = 0;
      for (const frame of normalizedFrames) {
        combined.set(frame, offset);
        offset += frame.length;
      }
      return combined;
    }

    const normalizedFrames = pixelData.map((frame) =>
      frame instanceof Uint8Array ? frame : new Uint8Array(frame)
    );
    const totalLength = normalizedFrames.reduce(
      (acc, frame) => acc + frame.length,
      0
    );
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const frame of normalizedFrames) {
      combined.set(frame, offset);
      offset += frame.length;
    }
    return combined;
  }

  if (pixelData instanceof Uint8Array || pixelData instanceof Uint16Array) {
    return pixelData;
  }

  return new Uint8Array(pixelData);
}

function getExpectedVoxelCount(multiframe) {
  const numberOfFrames =
    Number(multiframe.NumberOfFrames) ||
    multiframe.PerFrameFunctionalGroupsSequence?.length ||
    1;
  return multiframe.Rows * multiframe.Columns * numberOfFrames;
}

type DecodeFrameImageData = (
  frameImageId: string,
  frameNumber: number
) => Promise<
  | ArrayLike<number>
  | ArrayLike<number>[]
  | Uint8Array
  | Uint16Array
  | (Uint8Array | Uint16Array)[]
>;

/** Default cap on concurrent SEG frame fetch/decode operations. */
const DEFAULT_SEG_FRAME_DECODE_CONCURRENCY = 16;

/**
 * Maps items through an async fn with at most `limit` concurrent calls,
 * preserving input order in the result array. Used to overlap SEG frame
 * fetch/decode instead of awaiting each frame serially: a pool of `limit`
 * workers pulls the next frame index as soon as it finishes the previous one,
 * keeping up to `limit` requests in flight at all times.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  };

  const poolSize = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: poolSize }, worker));

  return results;
}

function getSegNumberOfFrames(multiframe: Record<string, unknown>): number {
  const fromTag = Number(multiframe.NumberOfFrames);
  if (fromTag > 0) {
    return fromTag;
  }
  const perFrame = multiframe.PerFrameFunctionalGroupsSequence;
  if (Array.isArray(perFrame) && perFrame.length > 0) {
    return perFrame.length;
  }
  return 1;
}

/** Expands WADO-RS …/frames/1 into one imageId per frame when frameImageIds are not supplied. */
function expandWadorsFrameImageIds(
  segImageId: string,
  numberOfFrames: number
): string[] {
  const frameMatch = segImageId.match(/(.*\/frames\/)(\d+)(.*)$/);
  if (!frameMatch || numberOfFrames <= 1) {
    return [segImageId];
  }

  const prefix = frameMatch[1];
  const suffix = frameMatch[3] || '';
  const frameImageIds: string[] = [];

  for (let frameNumber = 1; frameNumber <= numberOfFrames; frameNumber++) {
    frameImageIds.push(`${prefix}${frameNumber}${suffix}`);
  }

  return frameImageIds;
}

const WADO_URI_FRAME_SCHEME = /^(wadouri:|dicomfile:)/;

/**
 * Expands a WADO-URI / local SEG imageId into one imageId per frame using the
 * `?frame=N` / `&frame=N` (1-based) convention. Returns `[segImageId]` when the
 * scheme is not WADO-URI-style or the SEG is single-frame.
 */
function expandWadoUriFrameImageIds(
  segImageId: string,
  numberOfFrames: number
): string[] {
  if (numberOfFrames <= 1 || !WADO_URI_FRAME_SCHEME.test(segImageId)) {
    return [segImageId];
  }

  const base = segImageId.split('&frame=')[0].split('?frame=')[0];
  const separator = base.includes('?') ? '&' : '?';
  const frameImageIds: string[] = [];

  for (let frameNumber = 1; frameNumber <= numberOfFrames; frameNumber++) {
    frameImageIds.push(`${base}${separator}frame=${frameNumber}`);
  }

  return frameImageIds;
}

function resolveFrameImageIds({
  segImageId,
  numberOfFrames,
  frameImageIds,
  getFrameImageId,
}: {
  segImageId: string;
  numberOfFrames: number;
  frameImageIds?: string[];
  getFrameImageId?: (baseSegImageId: string, frameNumber: number) => string;
}): string[] {
  if (frameImageIds?.length) {
    return frameImageIds;
  }

  if (getFrameImageId) {
    return Array.from({ length: numberOfFrames }, (_, index) =>
      getFrameImageId(segImageId, index + 1)
    );
  }

  // The adapter can only synthesize per-frame imageIds for schemes whose
  // frame-addressing convention it knows: WADO-RS (`.../frames/N`) and WADO-URI
  // (`?frame=N` / `&frame=N`). For any other scheme the caller must supply
  // frameImageIds or getFrameImageId.
  const wadorsFrameIds = expandWadorsFrameImageIds(segImageId, numberOfFrames);
  if (wadorsFrameIds.length > 1) {
    return wadorsFrameIds;
  }

  const wadoUriFrameIds = expandWadoUriFrameImageIds(
    segImageId,
    numberOfFrames
  );
  if (wadoUriFrameIds.length > 1) {
    return wadoUriFrameIds;
  }

  // Multiframe SEG whose scheme we cannot address per-frame. Do NOT fall back to
  // repeating the base imageId: that decodes frame 1 and paints it onto every
  // slice, silently corrupting the segmentation. Force the caller to supply the
  // per-frame ids explicitly.
  if (numberOfFrames > 1) {
    throw new Error(
      `Cannot derive per-frame imageIds for multiframe SEG "${segImageId}" ` +
        `(${numberOfFrames} frames): its imageId scheme is not WADO-RS ` +
        `(".../frames/N") or WADO-URI ("?frame=N"/"&frame=N"). Supply ` +
        `options.frameImageIds or options.getFrameImageId for this data source.`
    );
  }

  return [segImageId];
}

function unpackFramePixelDataIfNeeded(
  framePixelData: Uint8Array | Uint16Array,
  multiframe: Record<string, unknown>,
  sliceLength: number
) {
  const bitsStored = Number(multiframe.BitsStored);
  if (bitsStored === 1 && framePixelData.length < sliceLength) {
    const packed =
      framePixelData instanceof Uint8Array
        ? framePixelData
        : new Uint8Array(framePixelData);
    return unpackBinaryFrameFromPacked(packed, sliceLength);
  }
  return framePixelData;
}

function ensureInstanceOnMetadataProvider(
  metadataProvider: {
    get: (type: string, imageId: string) => unknown;
    addCustomMetadata?: (
      imageId: string,
      type: string,
      metadata: unknown
    ) => void;
    add?: (imageId: string, type: string, metadata: unknown) => void;
  },
  segImageId: string,
  multiframe: Record<string, unknown>
) {
  if (metadataProvider.get('instance', segImageId)) {
    return;
  }

  if (metadataProvider.addCustomMetadata) {
    metadataProvider.addCustomMetadata(segImageId, 'instance', multiframe);
    return;
  }

  if (metadataProvider.add) {
    metadataProvider.add(segImageId, 'instance', multiframe);
  }
}

async function defaultDecodeFrameImageData(
  frameImageId: string,
  _frameNumber: number
) {
  const segImage = await imageLoader.loadImage(frameImageId);
  return segImage?.getPixelData?.();
}

async function decodeSegPixelDataFromFrameIds({
  segImageId,
  multiframe,
  frameImageIds,
  getFrameImageId,
  decodeImageData = defaultDecodeFrameImageData,
  concurrency = DEFAULT_SEG_FRAME_DECODE_CONCURRENCY,
}: {
  segImageId: string;
  multiframe: Record<string, unknown>;
  frameImageIds?: string[];
  getFrameImageId?: (baseSegImageId: string, frameNumber: number) => string;
  decodeImageData: DecodeFrameImageData;
  concurrency?: number;
}) {
  const rows = Number(multiframe.Rows);
  const columns = Number(multiframe.Columns);
  const sliceLength = rows * columns;
  const numberOfFrames = getSegNumberOfFrames(multiframe);
  const expectedVoxelCount = getExpectedVoxelCount(multiframe);
  const resolvedFrameImageIds = resolveFrameImageIds({
    segImageId,
    numberOfFrames,
    frameImageIds,
    getFrameImageId,
  });

  if (numberOfFrames <= 1) {
    const frameImageId = resolvedFrameImageIds[0] || segImageId;
    const framePixelData = await decodeImageData(frameImageId, 1);
    if (!framePixelData) {
      throw new Error(
        `No decoded pixel data found for SEG imageId: ${frameImageId}`
      );
    }
    const normalized = normalizeDecodedPixelData(framePixelData);
    const decodedPixelData = unpackFramePixelDataIfNeeded(
      normalized as Uint8Array,
      multiframe,
      sliceLength
    );
    return {
      pixelDataChunks: [decodedPixelData],
      expectedVoxelCount,
    };
  }

  // Fetch/decode frames with bounded concurrency so up to `concurrency`
  // requests overlap instead of awaiting each frame serially. Order is
  // preserved by mapWithConcurrency, keeping perFramePixelData frame-aligned.
  const perFramePixelData = await mapWithConcurrency(
    resolvedFrameImageIds.slice(0, numberOfFrames),
    concurrency,
    async (frameImageId, frameIndex) => {
      const frameNumber = frameIndex + 1;

      if (!frameImageId) {
        throw new Error(
          `Missing SEG frame imageId at frame ${frameNumber} (expected ${numberOfFrames} frame imageIds)`
        );
      }

      const framePixelData = await decodeImageData(frameImageId, frameNumber);

      if (!framePixelData) {
        throw new Error(
          `No decoded pixel data found for SEG frame imageId: ${frameImageId}`
        );
      }

      let normalizedFrame = normalizeDecodedPixelData(framePixelData) as
        | Uint8Array
        | Uint16Array;

      normalizedFrame = unpackFramePixelDataIfNeeded(
        normalizedFrame,
        multiframe,
        sliceLength
      ) as Uint8Array | Uint16Array;

      return normalizedFrame.subarray(0, sliceLength) as
        | Uint8Array
        | Uint16Array;
    }
  );

  // Keep one typed array per frame instead of concatenating into a single
  // monolithic buffer. readFromUnpackedChunks already reads across chunks.
  return {
    pixelDataChunks: perFramePixelData,
    expectedVoxelCount,
  };
}

const updateSegmentsOnFrame = ({
  segmentsOnFrame,
  imageIdIndex,
  segmentIndex,
}) => {
  if (!segmentsOnFrame[imageIdIndex]) {
    segmentsOnFrame[imageIdIndex] = [];
  }

  segmentsOnFrame[imageIdIndex].push(segmentIndex);
};

const updateSegmentsPixelIndices = ({
  segmentsPixelIndices,
  segmentIndex,
  imageIdIndex,
  indexCache,
}) => {
  if (!segmentsPixelIndices.has(segmentIndex)) {
    segmentsPixelIndices.set(segmentIndex, {});
  }
  const segmentIndexObject = segmentsPixelIndices.get(segmentIndex);
  segmentIndexObject[imageIdIndex] = indexCache;
  segmentsPixelIndices.set(segmentIndex, segmentIndexObject);
};

const extractInfoFromPerFrameFunctionalGroups = ({
  PerFrameFunctionalGroups,
  sequenceIndex,
  sopUIDImageIdIndexMap,
  multiframe,
}) => {
  const derivationImageSequence =
    PerFrameFunctionalGroups?.DerivationImageSequence;
  const normalizedDerivationImageSequence = Array.isArray(
    derivationImageSequence
  )
    ? derivationImageSequence[0]
    : derivationImageSequence;
  const sourceImageSequence =
    normalizedDerivationImageSequence?.SourceImageSequence;
  const normalizedSourceImageSequence = Array.isArray(sourceImageSequence)
    ? sourceImageSequence[0]
    : sourceImageSequence;
  const referencedSOPInstanceUid =
    normalizedSourceImageSequence?.ReferencedSOPInstanceUID;
  const referencedImageId =
    referencedSOPInstanceUid && normalizedSourceImageSequence
      ? getImageIdOfSourceImageBySourceImageSequence(
          normalizedSourceImageSequence,
          sopUIDImageIdIndexMap
        )
      : undefined;
  const segmentIndex = getSegmentIndex(multiframe, sequenceIndex);

  return { referencedSOPInstanceUid, referencedImageId, segmentIndex };
};

const getReferencedImageIdFromPerFrameGroup = ({
  perFrameFunctionalGroup,
  sopUIDImageIdIndexMap,
}) => {
  const derivationImageSequence =
    perFrameFunctionalGroup?.DerivationImageSequence;
  const normalizedDerivationImageSequence = Array.isArray(
    derivationImageSequence
  )
    ? derivationImageSequence[0]
    : derivationImageSequence;
  const sourceImageSequence =
    normalizedDerivationImageSequence?.SourceImageSequence;
  const normalizedSourceImageSequence = Array.isArray(sourceImageSequence)
    ? sourceImageSequence[0]
    : sourceImageSequence;
  const referencedSOPInstanceUID =
    normalizedSourceImageSequence?.ReferencedSOPInstanceUID;

  if (!referencedSOPInstanceUID || !normalizedSourceImageSequence) {
    return;
  }

  return getImageIdOfSourceImageBySourceImageSequence(
    normalizedSourceImageSequence,
    sopUIDImageIdIndexMap
  );
};

/**
 * Creates labelmap images from a SEG instance using per-frame imageIds and a decode callback.
 * This is the primary entry point for OHIF and other hosts that load pixels via imageLoader.
 *
 * `options.frameImageIds` is optional: it is the list of per-frame imageIds the
 * segmentation contains (as produced when the SEG object is loaded). It only
 * needs to be supplied for data sources whose imageIds do not follow the
 * DICOMweb (WADO-RS) or WADO-URI conventions — for those, the per-frame list is
 * derived automatically from `segImageId` (see `resolveFrameImageIds`).
 */
async function createLabelmapsFromSegImageIds(
  referencedImageIds,
  segImageId,
  metadataProvider,
  options
) {
  const {
    tolerance = 1e-3,
    TypedArrayConstructor = Uint8Array,
    maxBytesPerChunk,
    parserType = 'bitmap',
    frameImageIds,
    getFrameImageId,
    decodeImageData = defaultDecodeFrameImageData,
    // Max number of SEG frames fetched/decoded concurrently (default 16).
    concurrency = DEFAULT_SEG_FRAME_DECODE_CONCURRENCY,
    // Callers that already hold the normalized SEG dataset (e.g. the buffer
    // path) can pass it directly to avoid a metadata-provider round-trip. Some
    // providers (notably OHIF's) short-circuit `get('instance', ...)` before
    // consulting custom metadata, so a synthetic SEG imageId is not retrievable.
    multiframe: providedMultiframe = undefined,
  } = options ?? {};

  let multiframe = providedMultiframe;
  if (!multiframe) {
    const instanceMeta = metadataProvider.get('instance', segImageId);
    if (!instanceMeta) {
      throw new Error(
        `No instance metadata found for SEG imageId: ${segImageId}. Ensure the SEG instance is registered in the metadata provider (e.g. after loading the image).`
      );
    }
    multiframe = instanceMeta.dataset ?? instanceMeta;
  }

  prepareSegMultiframeMetadata(multiframe);

  const imagePlaneModule = metadataProvider.get(
    'imagePlaneModule',
    referencedImageIds[0]
  );
  const generalSeriesModule = metadataProvider.get(
    'generalSeriesModule',
    referencedImageIds[0]
  );

  const SeriesInstanceUID = generalSeriesModule.seriesInstanceUID;

  if (!imagePlaneModule) {
    console.warn('Insufficient metadata, imagePlaneModule missing.');
  }

  const ImageOrientationPatient = Array.isArray(imagePlaneModule.rowCosines)
    ? [...imagePlaneModule.rowCosines, ...imagePlaneModule.columnCosines]
    : [
        imagePlaneModule.rowCosines.x,
        imagePlaneModule.rowCosines.y,
        imagePlaneModule.rowCosines.z,
        imagePlaneModule.columnCosines.x,
        imagePlaneModule.columnCosines.y,
        imagePlaneModule.columnCosines.z,
      ];

  // Get IOP from ref series, compute supported orientations:
  const validOrientations = getValidOrientations(ImageOrientationPatient);
  const segMetadata = getSegmentMetadata(multiframe, SeriesInstanceUID);

  const { pixelDataChunks, expectedVoxelCount } =
    await decodeSegPixelDataFromFrameIds({
      segImageId,
      multiframe,
      frameImageIds,
      getFrameImageId,
      decodeImageData,
      concurrency,
    });
  const sliceLength = multiframe.Rows * multiframe.Columns;

  // 1-bit packed SEGs may arrive as one continuous packed buffer in a single
  // chunk; unpack it into per-frame chunks when the sample count is short.
  let resolvedPixelDataChunks = pixelDataChunks;
  if (
    Number(multiframe.BitsStored) === 1 &&
    pixelDataChunks.length === 1 &&
    pixelDataChunks[0].length < expectedVoxelCount
  ) {
    const packed = pixelDataChunks[0];
    const unpacked = unpackBinaryFrameFromPacked(
      packed instanceof Uint8Array ? packed : new Uint8Array(packed),
      sliceLength
    );
    resolvedPixelDataChunks = chunkPixelData(unpacked, { maxBytesPerChunk });
  }

  const totalSamples = resolvedPixelDataChunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0
  );
  const decodedFrameCount = Math.max(1, Math.floor(totalSamples / sliceLength));

  if (
    multiframe.SegmentationType === 'FRACTIONAL' &&
    !isPseudoBinaryFractionalFromChunks(
      resolvedPixelDataChunks,
      multiframe.MaximumFractionalValue
    )
  ) {
    // 4.x accepted "pseudo-binary" FRACTIONAL objects whose pixels are only 0 or
    // MaximumFractionalValue and processed them as binary. That still works here
    // (the fill logic keys off whether a voxel is non-zero, not its magnitude, and
    // the per-frame segment index comes from the functional groups). Only genuinely
    // fractional data — intermediate probabilities — remains unsupported.
    throw new Error('Fractional segmentations are not yet supported');
  }

  let finalPixelDataChunks = resolvedPixelDataChunks;
  if (maxBytesPerChunk && maxBytesPerChunk < Number.POSITIVE_INFINITY) {
    finalPixelDataChunks = resolvedPixelDataChunks.flatMap((chunk) =>
      chunkPixelData(chunk, { maxBytesPerChunk })
    );
  }

  const orientation = checkOrientation(
    multiframe,
    validOrientations,
    [
      imagePlaneModule.rows,
      imagePlaneModule.columns,
      referencedImageIds.length,
    ],
    tolerance
  );
  // Pre-compute the sop UID to imageId index map so that in the for loop
  // we don't have to call metadataProvider.get() for each imageId over
  // and over again.
  const sopUIDImageIdIndexMap = buildSopUIDImageIdIndexMap(
    referencedImageIds,
    metadataProvider
  );

  let insertFunction;

  switch (orientation) {
    case 'Planar':
      insertFunction = insertPixelDataPlanar;
      break;
    case 'Perpendicular':
      throw new Error(
        'Segmentations orthogonal to the acquisition plane of the source data are not yet supported.'
      );
    case 'Oblique':
      throw new Error(
        'Segmentations oblique to the acquisition plane of the source data are not yet supported.'
      );
  }

  /* if SEGs are overlapping:
    1) the labelmapBuffer will contain M volumes which have non-overlapping segments;
    2) segmentsOnFrame will have M * numberOfFrames values to track in which labelMap are the segments;
    3) insertFunction will return the number of LabelMaps
    4) generateToolState return is an array*/

  const segmentsOnFrame = [];

  const imageIdMaps = { indices: {}, metadata: {} };
  const labelMapImages = [];

  for (let i = 0; i < referencedImageIds.length; i++) {
    const referenceImageId = referencedImageIds[i];
    imageIdMaps.indices[referenceImageId] = i;
    imageIdMaps.metadata[referenceImageId] = metadataProvider.get(
      'instance',
      referenceImageId
    );
    const labelMapImage =
      imageLoader.createAndCacheDerivedLabelmapImage(referenceImageId);
    labelMapImages.push(labelMapImage);
  }

  // This is the centroid calculation for each segment Index, the data structure
  // is a Map with key = segmentIndex and value = {imageIdIndex: centroid, ...}
  // later on we will use this data structure to calculate the centroid of the
  // segment in the labelmapBuffer
  const segmentsPixelIndices = new Map();

  const { hasOverlappingSegments, arrayOfLabelMapImages } =
    await insertFunction({
      segmentsOnFrame,
      labelMapImages,
      pixelDataChunks: finalPixelDataChunks,
      multiframe,
      referencedImageIds,
      validOrientations,
      metadataProvider,
      tolerance,
      segmentsPixelIndices,
      sopUIDImageIdIndexMap,
      imageIdMaps,
      TypedArrayConstructor,
      parserType,
      decodedFrameCount,
    });

  // calculate the centroid of each segment
  const centroidXYZ = new Map();

  segmentsPixelIndices.forEach((imageIdIndexBufferIndex, segmentIndex) => {
    const centroids = calculateCentroid(
      imageIdIndexBufferIndex,
      multiframe,
      metadataProvider,
      referencedImageIds
    );

    centroidXYZ.set(segmentIndex, centroids);
  });

  return {
    labelMapImages: arrayOfLabelMapImages,
    segMetadata,
    segmentsOnFrame,
    centroids: centroidXYZ,
    overlappingSegments: hasOverlappingSegments,
  };
}

const throttledTriggerLoadProgressEvent = cstUtils.throttle(
  (percentComplete) => {
    triggerEvent(eventTarget, Events.SEGMENTATION_LOAD_PROGRESS, {
      percentComplete,
    });
  },
  200
);

export function insertPixelDataPlanar({
  segmentsOnFrame,
  labelMapImages,
  pixelDataChunks,
  multiframe,
  referencedImageIds,
  validOrientations,
  metadataProvider,
  tolerance,
  segmentsPixelIndices,
  sopUIDImageIdIndexMap,
  imageIdMaps,
  parserType,
  decodedFrameCount,
}) {
  const {
    SharedFunctionalGroupsSequence,
    PerFrameFunctionalGroupsSequence,
    Rows,
    Columns,
  } = multiframe;

  const sharedImageOrientationPatient =
    SharedFunctionalGroupsSequence.PlaneOrientationSequence
      ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
          .ImageOrientationPatient
      : undefined;
  const sliceLength = Columns * Rows;

  const metadataFrameCount =
    Number(multiframe.NumberOfFrames) ||
    PerFrameFunctionalGroupsSequence.length;
  const groupsLenFromMetadata =
    PerFrameFunctionalGroupsSequence.length || metadataFrameCount;
  const groupsLen =
    typeof decodedFrameCount === 'number'
      ? Math.min(groupsLenFromMetadata, decodedFrameCount)
      : groupsLenFromMetadata;

  let overlapping = false;
  // Below, we chunk the processing of the frames to avoid blocking the main thread
  // if the segmentation is large. We also use a promise to allow the caller to
  // wait for the processing to finish.
  return new Promise((resolve) => {
    const percentImagesPerChunk = 0.1;
    const imagesPerChunk = Math.ceil(groupsLen * percentImagesPerChunk);
    const processChunk = (firstIndex) => {
      for (
        let i = firstIndex;
        i < firstIndex + imagesPerChunk && i < groupsLen;
        i++
      ) {
        const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

        const ImageOrientationPatientI =
          sharedImageOrientationPatient ||
          PerFrameFunctionalGroups?.PlaneOrientationSequence
            ?.ImageOrientationPatient;

        if (!ImageOrientationPatientI) {
          throw new Error(
            `SEG frame ${i + 1} is missing ImageOrientationPatient in per-frame and shared functional groups.`
          );
        }

        const view = readFromUnpackedChunks(
          pixelDataChunks,
          i * sliceLength,
          sliceLength
        );

        const pixelDataI2D = ndarray(view, [Rows, Columns]);

        const alignedPixelDataI = alignPixelDataWithSourceData(
          pixelDataI2D,
          ImageOrientationPatientI,
          validOrientations,
          tolerance
        );

        if (!alignedPixelDataI) {
          throw new Error(
            'Individual SEG frames are out of plane with respect to the first SEG frame. ' +
              'This is not yet supported. Aborting segmentation loading.'
          );
        }

        const segmentIndex = getSegmentIndex(multiframe, i);

        if (segmentIndex === undefined) {
          throw new Error(
            'Could not retrieve the segment index. Aborting segmentation loading.'
          );
        }

        if (!segmentsPixelIndices.has(segmentIndex)) {
          segmentsPixelIndices.set(segmentIndex, {});
        }

        let imageId = findReferenceSourceImageId(
          multiframe,
          i,
          referencedImageIds,
          metadataProvider,
          tolerance,
          sopUIDImageIdIndexMap
        );

        if (!imageId) {
          console.warn(
            "Image not present in stack, can't import frame : " + i + '.'
          );
          continue;
        }

        const stackImageId = ensureImageIdMapsEntry(
          imageId,
          referencedImageIds,
          imageIdMaps,
          metadataProvider
        );

        if (!stackImageId) {
          console.warn(
            `Image not present in stack, can't import frame : ${i}.`
          );
          continue;
        }

        const sourceImageMetadata = imageIdMaps.metadata[stackImageId];

        if (!sourceImageMetadata) {
          console.warn(
            `No instance metadata for referenced image at frame : ${i}.`
          );
          continue;
        }

        if (
          Rows !== sourceImageMetadata.Rows ||
          Columns !== sourceImageMetadata.Columns
        ) {
          throw new Error(
            'Individual SEG frames have different geometry dimensions (Rows and Columns) ' +
              'respect to the source image reference frame. This is not yet supported. ' +
              'Aborting segmentation loading. '
          );
        }

        const imageIdIndex = imageIdMaps.indices[stackImageId];
        const labelmapImage = labelMapImages[imageIdIndex];
        const labelmap2DView = labelmapImage.getPixelData();
        const imageVoxelManager = labelmapImage.voxelManager;

        const data = alignedPixelDataI.data;

        const indexCache = [];
        for (let k = 0, len = alignedPixelDataI.data.length; k < len; ++k) {
          if (data[k]) {
            for (let x = k; x < len; ++x) {
              if (data[x]) {
                if (!overlapping && labelmap2DView[x] !== 0) {
                  overlapping = true;
                  return resolve(
                    insertOverlappingPixelDataPlanar({
                      segmentsOnFrame,
                      labelMapImages,
                      pixelDataChunks,
                      multiframe,
                      referencedImageIds,
                      validOrientations,
                      metadataProvider,
                      tolerance,
                      segmentsPixelIndices,
                      sopUIDImageIdIndexMap,
                      imageIdMaps,
                    })
                  );
                }
                if (imageVoxelManager) {
                  // Ensure voxelManager updates boundaries
                  imageVoxelManager.setAtIndex(x, segmentIndex);
                } else {
                  // Directly assign pixel data when volume is not managed via voxelManager.
                  labelmap2DView[x] = segmentIndex;
                }
                indexCache.push(x);
              }
            }

            if (!segmentsOnFrame[imageIdIndex]) {
              segmentsOnFrame[imageIdIndex] = [];
            }

            segmentsOnFrame[imageIdIndex].push(segmentIndex);

            break;
          }
        }

        const segmentIndexObject = segmentsPixelIndices.get(segmentIndex);
        segmentIndexObject[imageIdIndex] = indexCache;
        segmentsPixelIndices.set(segmentIndex, segmentIndexObject);
      }

      const percentComplete = Math.round((firstIndex / groupsLen) * 100);
      throttledTriggerLoadProgressEvent(percentComplete);

      if (firstIndex < groupsLen) {
        setTimeout(() => processChunk(firstIndex + imagesPerChunk), 0);
      } else {
        // resolve the Promise when all images have been processed
        resolve({
          hasOverlappingSegments: false,
          arrayOfLabelMapImages: [labelMapImages],
        });
      }
    };
    const processLabelmapChunk = (firstIndex) => {
      // Cache properties and lengths outside loops for performance
      const pfSeq = multiframe.PerFrameFunctionalGroupsSequence;
      const sharedPlaneOrientation =
        multiframe.SharedFunctionalGroupsSequence.PlaneOrientationSequence
          ?.ImageOrientationPatient;
      for (
        let i = firstIndex;
        i < firstIndex + imagesPerChunk && i < groupsLen;
        i++
      ) {
        const PerFrameFunctionalGroups = pfSeq[i];
        const ImageOrientationPatientI =
          sharedPlaneOrientation ||
          PerFrameFunctionalGroups?.PlaneOrientationSequence
            ?.ImageOrientationPatient ||
          validOrientations[0];
        const view = readFromUnpackedChunks(
          pixelDataChunks,
          i * sliceLength,
          sliceLength
        );
        const pixelDataI2D = ndarray(view, [Rows, Columns]);
        const alignedPixelDataI = alignPixelDataWithSourceData(
          pixelDataI2D,
          ImageOrientationPatientI,
          validOrientations,
          tolerance
        );
        if (!alignedPixelDataI) {
          throw new Error(
            'Individual Labelmap SEG frames are out of plane with respect to the first SEG frame. ' +
              'This is not yet supported. Aborting segmentation loading.'
          );
        }
        let imageId = findReferenceSourceImageId(
          multiframe,
          i,
          referencedImageIds,
          metadataProvider,
          tolerance,
          sopUIDImageIdIndexMap
        );
        if (!imageId) {
          imageId = getReferencedImageIdFromPerFrameGroup({
            perFrameFunctionalGroup: PerFrameFunctionalGroups,
            sopUIDImageIdIndexMap,
          });
        }

        if (!imageId) {
          console.warn(
            `Image not present in stack, can't import frame : ${i}.`
          );
          continue;
        }

        const stackImageId = ensureImageIdMapsEntry(
          imageId,
          referencedImageIds,
          imageIdMaps,
          metadataProvider
        );

        if (!stackImageId) {
          console.warn(
            `Image not present in stack, can't import frame : ${i}.`
          );
          continue;
        }

        const sourceImageMetadata = imageIdMaps.metadata[stackImageId];

        if (!sourceImageMetadata) {
          console.warn(
            `No instance metadata for referenced image at frame : ${i}.`
          );
          continue;
        }

        if (
          Rows !== sourceImageMetadata.Rows ||
          Columns !== sourceImageMetadata.Columns
        ) {
          throw new Error(
            'Individual Labelmap SEG frames have different geometry dimensions (Rows and Columns) ' +
              'respect to the source image reference frame. This is not yet supported. ' +
              'Aborting segmentation loading. '
          );
        }
        const imageIdIndex = imageIdMaps.indices[stackImageId];
        const labelmapImage = labelMapImages[imageIdIndex];
        const labelmap2DView = labelmapImage.getPixelData(); // TypedArray
        const imageVoxelManager = labelmapImage.voxelManager;
        const data = alignedPixelDataI.data;
        let segmentsOnFrameArr = segmentsOnFrame[imageIdIndex];
        if (!segmentsOnFrameArr) {
          segmentsOnFrameArr = [];
          segmentsOnFrame[imageIdIndex] = segmentsOnFrameArr;
        }
        // Use a local Set to avoid .includes() in tight loop
        const segSet = new Set(segmentsOnFrameArr);
        for (let k = 0, len = data.length; k < len; ++k) {
          const segIdx = data[k];
          if (segIdx !== 0) {
            if (imageVoxelManager) {
              imageVoxelManager.setAtIndex(k, segIdx);
            } else {
              labelmap2DView[k] = segIdx;
            }
            if (!segSet.has(segIdx)) {
              segmentsOnFrameArr.push(segIdx);
              segSet.add(segIdx);
            }
            if (!segmentsPixelIndices.has(segIdx)) {
              segmentsPixelIndices.set(segIdx, {});
            }
            const segmentPixelInfo = segmentsPixelIndices.get(segIdx);
            if (!segmentPixelInfo[imageIdIndex]) {
              segmentPixelInfo[imageIdIndex] = [];
            }
            segmentPixelInfo[imageIdIndex].push(k);
          }
        }
      }
      const percentComplete = Math.round((firstIndex / groupsLen) * 100);
      throttledTriggerLoadProgressEvent(percentComplete);
      if (firstIndex < groupsLen) {
        setTimeout(() => processLabelmapChunk(firstIndex + imagesPerChunk), 0);
      } else {
        resolve({
          hasOverlappingSegments: false,
          arrayOfLabelMapImages: [labelMapImages],
        });
      }
    };

    const isLabelmapSegmentation =
      parserType === 'labelmap' ||
      multiframe.SOPClassUID === LABELMAP_SEG_SOP_CLASS_UID ||
      multiframe.SegmentationType === 'LABELMAP';

    if (isLabelmapSegmentation) {
      // If the segmentation is a labelmap, we can process it in chunks
      processLabelmapChunk(0);
    } else {
      processChunk(0);
    }
  });
}

const getAlignedPixelData = ({
  sharedImageOrientationPatient,
  PerFrameFunctionalGroups,
  pixelDataChunks,
  sequenceIndex,
  sliceLength,
  Rows,
  Columns,
  validOrientations,
  tolerance,
}) => {
  const ImageOrientationPatientI =
    sharedImageOrientationPatient ||
    PerFrameFunctionalGroups.PlaneOrientationSequence.ImageOrientationPatient;

  const view = readFromUnpackedChunks(
    pixelDataChunks,
    sequenceIndex * sliceLength,
    sliceLength
  );

  const pixelDataI2D = ndarray(view, [Rows, Columns]);

  const alignedPixelDataI = alignPixelDataWithSourceData(
    pixelDataI2D,
    ImageOrientationPatientI,
    validOrientations,
    tolerance
  );

  if (!alignedPixelDataI) {
    throw new Error(
      'Individual SEG frames are out of plane with respect to the first SEG frame. ' +
        'This is not yet supported. Aborting segmentation loading.'
    );
  }
  return alignedPixelDataI;
};

const checkImageDimensions = ({ metadataProvider, imageId, Rows, Columns }) => {
  const sourceImageMetadata = metadataProvider.get('instance', imageId);
  if (
    Rows !== sourceImageMetadata.Rows ||
    Columns !== sourceImageMetadata.Columns
  ) {
    throw new Error(
      'Individual SEG frames have different geometry dimensions (Rows and Columns) ' +
        'respect to the source image reference frame. This is not yet supported. ' +
        'Aborting segmentation loading. '
    );
  }
};

const getArrayOfLabelMapImagesWithSegmentData = ({
  arrayOfSegmentData,
  referencedImageIds,
}) => {
  let largestArray = [];
  let largestArrayIndex;

  for (let i = 0; i < arrayOfSegmentData.length; i++) {
    const segmentData = arrayOfSegmentData[i];
    if (segmentData.length > largestArray.length) {
      largestArray = segmentData;
      largestArrayIndex = i;
    }
  }

  return arrayOfSegmentData.map((arr) => {
    const labelMapImages = referencedImageIds
      .map((referencedImageId, i) => {
        const hasEmptySegmentData = !arr[i];

        // @TODO: right now cornerstone loses reference of the images when you don't have the complete set of images for each
        // grouping of segments, but in order to save memory we would ideally only duplicate images where the there is overlapping
        // so when this losing of reference is fixed, we can implement some filter like the one below in order to get rid of empty
        // segment images that only take up memory space
        // if (hasEmptySegmentData && i !== largestArrayIndex) {
        //     return;
        // }

        const labelMapImage =
          imageLoader.createAndCacheDerivedLabelmapImage(referencedImageId);

        const pixelData = labelMapImage.getPixelData();

        if (!hasEmptySegmentData) {
          for (let j = 0; j < pixelData.length; j++) {
            pixelData[j] = arr[i][j];
          }
        }

        return labelMapImage;
      })
      .filter(Boolean);
    return labelMapImages;
  });
};

export function insertOverlappingPixelDataPlanar({
  segmentsOnFrame,
  labelMapImages,
  pixelDataChunks,
  multiframe,
  referencedImageIds,
  validOrientations,
  metadataProvider,
  tolerance,
  segmentsPixelIndices,
  sopUIDImageIdIndexMap,
  imageIdMaps,
}) {
  const {
    SharedFunctionalGroupsSequence,
    PerFrameFunctionalGroupsSequence,
    Rows,
    Columns,
  } = multiframe;

  const sharedImageOrientationPatient =
    SharedFunctionalGroupsSequence.PlaneOrientationSequence
      ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
          .ImageOrientationPatient
      : undefined;
  const sliceLength = Columns * Rows;

  const arrayOfSegmentData = getArrayOfSegmentData({
    sliceLength,
    Rows,
    Columns,
    validOrientations,
    metadataProvider,
    imageIdMaps,
    segmentsOnFrame,
    tolerance,
    pixelDataChunks,
    PerFrameFunctionalGroupsSequence,
    labelMapImages,
    sopUIDImageIdIndexMap,
    multiframe,
    sharedImageOrientationPatient,
    segmentsPixelIndices,
  });

  const arrayOfLabelMapImagesWithSegmentData =
    getArrayOfLabelMapImagesWithSegmentData({
      arrayOfSegmentData,
      referencedImageIds,
    });

  return {
    arrayOfLabelMapImages: arrayOfLabelMapImagesWithSegmentData,
    hasOverlappingSegments: true,
  };
}

const getArrayOfSegmentData = ({
  sliceLength,
  Rows,
  Columns,
  validOrientations,
  metadataProvider,
  imageIdMaps,
  segmentsOnFrame,
  tolerance,
  pixelDataChunks,
  PerFrameFunctionalGroupsSequence,
  labelMapImages,
  sopUIDImageIdIndexMap,
  multiframe,
  sharedImageOrientationPatient,
  segmentsPixelIndices,
}) => {
  const arrayOfSegmentData = [];
  const numberOfSegments = multiframe.SegmentSequence.length;
  for (
    let currentSegmentIndex = 1;
    currentSegmentIndex <= numberOfSegments;
    ++currentSegmentIndex
  ) {
    const segmentData = getSegmentData({
      PerFrameFunctionalGroupsSequence,
      labelMapImages,
      sopUIDImageIdIndexMap,
      multiframe,
      segmentIndex: currentSegmentIndex,
      sliceLength,
      Rows,
      Columns,
      validOrientations,
      tolerance,
      pixelDataChunks,
      sharedImageOrientationPatient,
      metadataProvider,
      imageIdMaps,
      segmentsOnFrame,
      segmentsPixelIndices,
    });

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: segmentData,
    });
  }

  return arrayOfSegmentData;
};

const getSegmentData = ({
  PerFrameFunctionalGroupsSequence,
  labelMapImages,
  sopUIDImageIdIndexMap,
  multiframe,
  segmentIndex,
  sliceLength,
  Rows,
  Columns,
  validOrientations,
  tolerance,
  pixelDataChunks,
  sharedImageOrientationPatient,
  metadataProvider,
  imageIdMaps,
  segmentsOnFrame,
  segmentsPixelIndices,
}) => {
  const segmentData = [];

  for (
    let currentLabelMapImageIndex = 0;
    currentLabelMapImageIndex < labelMapImages.length;
    currentLabelMapImageIndex++
  ) {
    const currentLabelMapImage = labelMapImages[currentLabelMapImageIndex];
    const referencedImageId = currentLabelMapImage.referencedImageId;

    const PerFrameFunctionalGroupsIndex =
      PerFrameFunctionalGroupsSequence.findIndex(
        (PerFrameFunctionalGroups, currentSequenceIndex) => {
          const {
            segmentIndex: groupsSegmentIndex,
            referencedImageId: groupsReferenceImageId,
          } = extractInfoFromPerFrameFunctionalGroups({
            PerFrameFunctionalGroups,
            sequenceIndex: currentSequenceIndex,
            sopUIDImageIdIndexMap,
            multiframe,
          });

          const isCorrectPerFrameFunctionalGroup =
            groupsSegmentIndex === segmentIndex &&
            groupsReferenceImageId === currentLabelMapImage.referencedImageId;

          return isCorrectPerFrameFunctionalGroup;
        }
      );

    if (PerFrameFunctionalGroupsIndex === -1) {
      continue;
    }

    const PerFrameFunctionalGroups =
      PerFrameFunctionalGroupsSequence[PerFrameFunctionalGroupsIndex];

    const alignedPixelDataI = getAlignedPixelData({
      sharedImageOrientationPatient,
      PerFrameFunctionalGroups,
      pixelDataChunks,
      sequenceIndex: PerFrameFunctionalGroupsIndex,
      sliceLength,
      Rows,
      Columns,
      validOrientations,
      tolerance,
    });

    checkImageDimensions({
      metadataProvider,
      Rows,
      Columns,
      imageId: referencedImageId,
    });

    const indexCache = [];
    const segmentationDataForImageId = alignedPixelDataI.data.map(
      (pixel, pixelIndex) => {
        const pixelValue = pixel ? segmentIndex : 0;
        if (pixelValue) {
          indexCache.push(pixelIndex);
        }
        return pixel ? segmentIndex : 0;
      }
    );

    const hasWrittenSegmentationData = indexCache.length > 0;

    if (hasWrittenSegmentationData) {
      segmentData[currentLabelMapImageIndex] = segmentationDataForImageId;
    }

    const imageIdIndex = imageIdMaps.indices[referencedImageId];

    updateSegmentsOnFrame({
      imageIdIndex,
      segmentIndex,
      segmentsOnFrame,
    });
    updateSegmentsPixelIndices({
      imageIdIndex,
      segmentIndex,
      segmentsPixelIndices,
      indexCache,
    });
  }
  return segmentData;
};

/**
 * Legacy entry: parse a Part 10 buffer, decode pixels from dataset PixelData, and
 * delegate to createLabelmapsFromSegImageIds with synthetic frame imageIds.
 */
async function createLabelmapsFromDICOMBuffer(
  referencedImageIds,
  arrayBuffer,
  metadataProvider,
  options: Record<string, unknown> = {}
) {
  const dicomData = DicomMessage.readFile(arrayBuffer);
  const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
  dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
  const multiframe = Normalizer.normalizeToDataset([dataset]);

  const segImageId =
    (options.segImageId as string | undefined) ?? BUFFER_SEG_IMAGE_ID;
  ensureInstanceOnMetadataProvider(metadataProvider, segImageId, multiframe);

  const numberOfFrames = getSegNumberOfFramesFromDataset(multiframe);
  const frameImageIds = Array.from(
    { length: numberOfFrames },
    (_, index) => `${segImageId}#frame=${index + 1}`
  );

  const decodeImageData = createDecodeImageDataFromMultiframe(multiframe);

  return createLabelmapsFromSegImageIds(
    referencedImageIds,
    segImageId,
    metadataProvider,
    {
      ...options,
      frameImageIds,
      decodeImageData,
      // Pass the parsed dataset directly so the SEG metadata does not have to be
      // resolved back out of the provider via the synthetic buffer imageId.
      multiframe,
    }
  );
}

/** @deprecated Use createLabelmapsFromSegImageIds */
async function createLabelmapsFromBufferInternal(
  referencedImageIds,
  segImageId,
  metadataProvider,
  options
) {
  return createLabelmapsFromSegImageIds(
    referencedImageIds,
    segImageId,
    metadataProvider,
    options
  );
}

export {
  createLabelmapsFromSegImageIds,
  createLabelmapsFromDICOMBuffer,
  createLabelmapsFromBufferInternal,
  decodeSegPixelDataFromFrameIds,
  resolveFrameImageIds,
  buildSopUIDImageIdIndexMap,
  isPseudoBinaryFractional,
};
