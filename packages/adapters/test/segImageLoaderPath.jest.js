import { describe, it, expect, jest, beforeAll } from '@jest/globals';

// Keep the REAL imageLoader.loadImage / registerImageLoader — this suite exists
// to exercise the production per-frame path (createFromDicomSegImageId →
// createLabelmapsFromSegImageIds → defaultDecodeFrameImageData →
// imageLoader.loadImage → mapWithConcurrency). Only the derived-labelmap image
// factory is stubbed, as in the other SEG suites.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        const pixelData = new Uint8Array(16);
        return {
          referencedImageId,
          getPixelData: () => pixelData,
          voxelManager: {
            setAtIndex: (index, value) => (pixelData[index] = value),
          },
        };
      },
    },
  };
});

const { imageLoader } = require('@cornerstonejs/core');
const {
  createFromDicomSegImageId,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateToolState');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  CT_SOP_CLASS_UID,
  sopInstanceUidForSlice,
  makeReferencedStack,
} = require('./helpers/segRoundTrip');

const SCHEME = 'segframes';
const SEG_IMAGE_ID = `${SCHEME}:seg-instance`;
const SLICE_COUNT = 6;
// SEG frame k targets referenced slice TARGET_SLICES[k].
const TARGET_SLICES = [1, 3, 4];

// prettier-ignore
const FRAME_PIXELS = [
    [1, 1, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
    [0, 0, 0, 0,  0, 2, 2, 0,  0, 0, 0, 0,  0, 0, 0, 0],
    [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 3, 3,  0, 0, 0, 0]
];

const frameImageIds = TARGET_SLICES.map(
  (_, frameIndex) => `${SCHEME}:frame-${frameIndex + 1}`
);

/**
 * A naturalized LABELMAP SEG "instance" whose per-frame groups reference the
 * target slices by SOP Instance UID — the metadata half of what a loaded SEG
 * provides. Pixels come exclusively through the registered image loader.
 */
function buildSegMultiframe() {
  return {
    SOPClassUID: LABELMAP_SEG_SOP_CLASS_UID,
    SOPInstanceUID: '1.2.826.0.1.3680043.8.498.777',
    Modality: 'SEG',
    SegmentationType: 'LABELMAP',
    Rows: 4,
    Columns: 4,
    NumberOfFrames: TARGET_SLICES.length,
    BitsAllocated: 8,
    BitsStored: 8,
    HighBit: 7,
    SharedFunctionalGroupsSequence: {
      PlaneOrientationSequence: {
        ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
      },
      PixelMeasuresSequence: { PixelSpacing: [1, 1], SliceThickness: 1 },
    },
    PerFrameFunctionalGroupsSequence: TARGET_SLICES.map((sliceIndex) => ({
      PlanePositionSequence: {
        ImagePositionPatient: [0, 0, sliceIndex],
      },
      DerivationImageSequence: {
        SourceImageSequence: {
          ReferencedSOPClassUID: CT_SOP_CLASS_UID,
          ReferencedSOPInstanceUID: sopInstanceUidForSlice(sliceIndex),
        },
      },
    })),
    SegmentSequence: [1, 2, 3].map((segmentNumber) => ({
      SegmentNumber: segmentNumber,
      SegmentLabel: `Segment ${segmentNumber}`,
      SegmentAlgorithmType: 'MANUAL',
    })),
  };
}

/**
 * Image loader for the SEG frame imageIds. Records requested ids and the
 * number of loads in flight; resolves LATER frames FASTER (reverse delays) so
 * order preservation is only satisfied if mapWithConcurrency keeps results
 * index-aligned rather than completion-ordered.
 */
function makeFrameLoader() {
  const requestedImageIds = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const loader = (imageId) => {
    requestedImageIds.push(imageId);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);

    const frameIndex = frameImageIds.indexOf(imageId);
    const delayMs = (frameImageIds.length - frameIndex) * 10;

    const promise = new Promise((resolve) => {
      setTimeout(() => {
        inFlight--;
        resolve({
          imageId,
          getPixelData: () => Uint8Array.from(FRAME_PIXELS[frameIndex]),
        });
      }, delayMs);
    });

    return { promise, cancelFn: undefined };
  };

  return {
    loader,
    requestedImageIds,
    getMaxInFlight: () => maxInFlight,
  };
}

describe('SEG per-frame image-loader path (plan 6c)', () => {
  let stack;
  let frameLoader;
  let result;

  beforeAll(async () => {
    stack = makeReferencedStack(SLICE_COUNT);
    frameLoader = makeFrameLoader();
    imageLoader.registerImageLoader(SCHEME, frameLoader.loader);

    // The SEG "instance" comes out of the metadata provider, as it would
    // after the loader registered the loaded SEG instance.
    const segMultiframe = buildSegMultiframe();
    const metadataProvider = {
      get: (type, imageId) =>
        type === 'instance' && imageId === SEG_IMAGE_ID
          ? segMultiframe
          : stack.metadataProvider.get(type, imageId),
    };

    result = await createFromDicomSegImageId(stack.imageIds, SEG_IMAGE_ID, {
      metadataProvider,
      frameImageIds,
      concurrency: 2,
    });
  });

  it('fetches every SEG frame through the real image loader', () => {
    expect(frameLoader.requestedImageIds).toHaveLength(frameImageIds.length);
    expect([...frameLoader.requestedImageIds].sort()).toEqual(
      [...frameImageIds].sort()
    );
  });

  it('overlaps frame loads but never exceeds the concurrency limit', () => {
    expect(frameLoader.getMaxInFlight()).toBe(2);
  });

  it('keeps frames index-aligned despite out-of-order completion', () => {
    const labelmapImagesBySourceId = new Map(
      result.labelMapImages
        .flat()
        .map((image) => [image.referencedImageId, image])
    );
    const pixelsForSlice = (sliceIndex) =>
      Array.from(
        labelmapImagesBySourceId.get(stack.imageIds[sliceIndex]).getPixelData()
      );

    TARGET_SLICES.forEach((sliceIndex, frameIndex) => {
      expect(pixelsForSlice(sliceIndex)).toEqual(FRAME_PIXELS[frameIndex]);
    });
    // Untouched slice stays empty.
    expect(pixelsForSlice(0)).toEqual(new Array(16).fill(0));

    expect(result.segmentsOnFrame[3]).toEqual([2]);
    expect(result.segmentsOnFrame[4]).toEqual([3]);
  });
});
