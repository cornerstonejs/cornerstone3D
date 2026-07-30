import { describe, it, expect, jest } from '@jest/globals';

// Same setup as segRealDerivationRoundTrip: only the derived-labelmap image
// factory is stubbed; export (real dcmjs derive), encode, Part 10 write/read,
// decode and the labelmap insert path all run for real.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        // Uint16 so segment values > 255 survive readback.
        const pixelData = new Uint16Array(16);
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

const {
  generateSegmentation,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');
const {
  createFromDICOMSegBuffer,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateToolState');
const {
  createLabelmapsFromDICOMBuffer,
} = require('../src/adapters/Cornerstone3D/Segmentation/labelmapImagesFromBuffer');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
  makeReferencedStack,
  buildLabelmap3D,
  datasetToPart10Buffer,
} = require('./helpers/segRoundTrip');

const SLICE_COUNT = 6;

// Labels 3 and 300 — 300 cannot be represented in 8 bits, so the export must
// widen to 16-bit instead of wrapping mod 256 (300 % 256 = 44).
// prettier-ignore
const HIGH_LABEL_SLICE = [
    300, 300, 0, 0,
    0,   0,   0, 0,
    3,   3,   0, 0,
    0,   0,   0, 0
];
// prettier-ignore
const LOW_LABEL_SLICE = [
    0, 0, 0,   0,
    0, 3, 0,   0,
    0, 0, 300, 0,
    0, 0, 0,   0
];
// prettier-ignore
const EMPTY_SLICE = [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];

function exportSixteenBitLabelmap(stack, options = {}) {
  const labelmap3D = buildLabelmap3D(
    SLICE_COUNT,
    {
      1: HIGH_LABEL_SLICE,
      4: LOW_LABEL_SLICE,
    },
    { SegmentArray: Uint16Array }
  );

  return generateSegmentation(
    stack.images,
    labelmap3D,
    stack.metadataProvider,
    {
      sopClassUID: LABELMAP_SEG_SOP_CLASS_UID,
      ...options,
    }
  );
}

function pixelReaderFor(stack, result) {
  const labelmapImagesBySourceId = new Map(
    result.labelMapImages
      .flat()
      .map((image) => [image.referencedImageId, image])
  );
  return (sliceIndex) =>
    Array.from(
      labelmapImagesBySourceId.get(stack.imageIds[sliceIndex]).getPixelData()
    );
}

describe('16-bit LABELMAP SEG round trip (plan 6b)', () => {
  it('widens to 16-bit for labels > 255 and round-trips uncompressed (Explicit VR LE)', async () => {
    const stack = makeReferencedStack(SLICE_COUNT);
    const { dataset } = exportSixteenBitLabelmap(stack);

    // 2f's deferred end-to-end assertion: real 16-bit dataset attributes.
    expect(String(dataset.BitsAllocated)).toBe('16');
    expect(String(dataset.BitsStored)).toBe('16');
    expect(String(dataset.HighBit)).toBe('15');
    expect(dataset.SegmentationType).toBe('LABELMAP');
    expect(dataset._meta.TransferSyntaxUID.Value[0]).toBe(
      '1.2.840.10008.1.2.1'
    );

    const buffer = datasetToPart10Buffer(dataset);
    const result = await createFromDICOMSegBuffer(stack.imageIds, buffer, {
      metadataProvider: stack.metadataProvider,
    });
    const pixelsForSlice = pixelReaderFor(stack, result);

    // Values survive intact — 300 stays 300, not 300 % 256 = 44.
    expect(pixelsForSlice(1)).toEqual(HIGH_LABEL_SLICE);
    expect(pixelsForSlice(4)).toEqual(LOW_LABEL_SLICE);
    expect(pixelsForSlice(0)).toEqual(EMPTY_SLICE);
  });

  it('round-trips 16-bit RLE Lossless through the real encode/decode (1b)', async () => {
    const stack = makeReferencedStack(SLICE_COUNT);
    const { dataset } = exportSixteenBitLabelmap(stack, {
      transferSyntaxUid: RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
    });

    expect(String(dataset.BitsAllocated)).toBe('16');
    expect(dataset._meta.TransferSyntaxUID.Value[0]).toBe(
      RLE_LOSSLESS_TRANSFER_SYNTAX_UID
    );

    const buffer = datasetToPart10Buffer(dataset);
    // Pre-fix, decodeSegFramesFromMultiframe routed 16-bit RLE through
    // dcmjs' 1-bit RLE rows decoder, which rejected 2-segment frames and
    // returned all zeros.
    const result = await createFromDICOMSegBuffer(stack.imageIds, buffer, {
      metadataProvider: stack.metadataProvider,
    });
    const pixelsForSlice = pixelReaderFor(stack, result);

    expect(pixelsForSlice(1)).toEqual(HIGH_LABEL_SLICE);
    expect(pixelsForSlice(4)).toEqual(LOW_LABEL_SLICE);
    expect(pixelsForSlice(0)).toEqual(EMPTY_SLICE);
  });

  it("honors an explicit parserType: 'labelmap' through the chunked labelmap insert", async () => {
    const stack = makeReferencedStack(SLICE_COUNT);
    const { dataset } = exportSixteenBitLabelmap(stack);
    const buffer = datasetToPart10Buffer(dataset);

    const result = await createLabelmapsFromDICOMBuffer(
      stack.imageIds,
      buffer,
      stack.metadataProvider,
      { parserType: 'labelmap' }
    );
    const pixelsForSlice = pixelReaderFor(stack, result);

    expect(pixelsForSlice(1)).toEqual(HIGH_LABEL_SLICE);
    expect(pixelsForSlice(4)).toEqual(LOW_LABEL_SLICE);
    expect(result.segmentsOnFrame[1]).toEqual(expect.arrayContaining([3, 300]));
  });
});
