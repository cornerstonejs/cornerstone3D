import { describe, it, expect, jest } from '@jest/globals';

// Only the derived-labelmap image factory is stubbed — the referenced CT
// images are never really loaded in a unit test. Everything else (dcmjs
// normalization, SegmentationDerivation/derive(), fill, encode, Part 10
// write/read, decode, orientation alignment, insert) runs for real.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        // Uint16 so 16-bit LABELMAP values (> 255) survive readback.
        const pixelData = new Uint16Array(16);
        return {
          referencedImageId,
          getPixelData: () => pixelData,
          voxelManager: {
            setAtIndex: (index, value) => (pixelData[index] = value),
            getAtIndex: (index) => pixelData[index],
            getWritableScalarData: () => pixelData,
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
  BINARY_SEG_SOP_CLASS_UID,
  sopInstanceUidForSlice,
  makeReferencedStack,
  buildLabelmap3D,
  datasetToPart10Buffer,
  firstItem,
  getFrameSourceReference,
} = require('./helpers/segRoundTrip');

const SLICE_COUNT = 12;

// prettier-ignore
const SHAPE_A = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];
// prettier-ignore
const SHAPE_B = [
    0, 0, 0, 0,
    0, 0, 1, 0,
    0, 0, 1, 0,
    0, 0, 0, 0
];
// prettier-ignore
const EMPTY_SLICE = [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];

async function readBack(stack, dataset) {
  const buffer = datasetToPart10Buffer(dataset);
  const result = await createFromDICOMSegBuffer(stack.imageIds, buffer, {
    metadataProvider: stack.metadataProvider,
  });
  const labelmapImagesBySourceId = new Map(
    result.labelMapImages
      .flat()
      .map((image) => [image.referencedImageId, image])
  );
  const pixelsForSlice = (sliceIndex) =>
    Array.from(
      labelmapImagesBySourceId.get(stack.imageIds[sliceIndex]).getPixelData()
    );
  return { result, pixelsForSlice };
}

describe('BINARY SEG frame positions', () => {
  // dcmjs sorts the frames of the referenced multiframe by position, so a
  // source frame index does not give the plane position of that frame. Each
  // frame must carry the position of its own source image, in either scan
  // direction, so that it reloads on that image.
  it.each([
    ['ascending', 1],
    ['descending', -1],
  ])(
    'writes the position of the source image of each frame (%s z)',
    async (_, zDirection) => {
      const stack = makeReferencedStack(SLICE_COUNT, { zDirection });
      const labelmap3D = buildLabelmap3D(SLICE_COUNT, {
        2: SHAPE_A,
        5: SHAPE_B,
      });

      const { dataset } = generateSegmentation(
        stack.images,
        labelmap3D,
        stack.metadataProvider
      );

      expect(dataset.SOPClassUID).toBe(BINARY_SEG_SOP_CLASS_UID);
      const perFrame = dataset.PerFrameFunctionalGroupsSequence;
      const frames = perFrame.map((group) => ({
        uid: getFrameSourceReference(group)?.ReferencedSOPInstanceUID,
        position: firstItem(
          group.PlanePositionSequence
        )?.ImagePositionPatient?.map(Number),
      }));
      expect(frames).toEqual([
        { uid: sopInstanceUidForSlice(2), position: [0, 0, zDirection * 2] },
        { uid: sopInstanceUidForSlice(5), position: [0, 0, zDirection * 5] },
      ]);

      const { pixelsForSlice } = await readBack(stack, dataset);
      expect(pixelsForSlice(2)).toEqual(SHAPE_A);
      expect(pixelsForSlice(5)).toEqual(SHAPE_B);
      expect(pixelsForSlice(SLICE_COUNT - 1 - 2)).toEqual(EMPTY_SLICE);
      expect(pixelsForSlice(SLICE_COUNT - 1 - 5)).toEqual(EMPTY_SLICE);
    }
  );
});
