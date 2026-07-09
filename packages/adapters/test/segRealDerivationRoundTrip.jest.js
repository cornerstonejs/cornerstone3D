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
  LABELMAP_SEG_SOP_CLASS_UID,
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

describe('real-derivation SEG round trip (plan 6a)', () => {
  describe('BINARY export of a lesion that starts at slice 10 (1e)', () => {
    it('derives, references the correct source slices, and reads back onto them', async () => {
      // Descending-z: the BINARY path inherits per-frame plane positions
      // from the dcmjs-normalized multiframe, whose frames are sorted by
      // DESCENDING distance along the scan axis. Only a stack already in
      // that order keeps positions aligned with the (input-order) pixels
      // and source refs — see the helper's makeReferencedStack docs.
      const stack = makeReferencedStack(SLICE_COUNT, { zDirection: -1 });
      const labelmap3D = buildLabelmap3D(SLICE_COUNT, {
        10: SHAPE_A,
        11: SHAPE_B,
      });

      // Pre-fix this threw a TypeError (derivation built from filtered
      // images, referencedFrameNumbers indexed in original space).
      const generated = generateSegmentation(
        stack.images,
        labelmap3D,
        stack.metadataProvider
      );
      const { dataset } = generated;

      expect(dataset.SOPClassUID).toBe(BINARY_SEG_SOP_CLASS_UID);
      expect(Number(dataset.NumberOfFrames)).toBe(2);

      // Each written frame must reference the source instance it was
      // drawn on — slices 10 and 11, not 0 and 1.
      const perFrame = dataset.PerFrameFunctionalGroupsSequence;
      expect(perFrame).toHaveLength(2);
      const referencedUids = perFrame.map(
        (group) => getFrameSourceReference(group)?.ReferencedSOPInstanceUID
      );
      expect(referencedUids).toEqual([
        sopInstanceUidForSlice(10),
        sopInstanceUidForSlice(11),
      ]);

      // And carry that slice's geometry, not slice 0's.
      const positions = perFrame.map(
        (group) => firstItem(group.PlanePositionSequence)?.ImagePositionPatient
      );
      expect(positions.map((p) => p?.map(Number))).toEqual([
        [0, 0, -10],
        [0, 0, -11],
      ]);

      const { pixelsForSlice } = await readBack(stack, dataset);
      expect(pixelsForSlice(10)).toEqual(SHAPE_A);
      expect(pixelsForSlice(11)).toEqual(SHAPE_B);
      expect(pixelsForSlice(0)).toEqual(EMPTY_SLICE);
      expect(pixelsForSlice(9)).toEqual(EMPTY_SLICE);
    });
  });

  describe('LABELMAP export per-frame plane positions (1d)', () => {
    it('writes real plane sequences after derive() and reads back multi-label frames', async () => {
      const stack = makeReferencedStack(SLICE_COUNT);
      // prettier-ignore
      const multiLabelSlice = [
                1, 1, 0, 0,
                0, 0, 0, 0,
                2, 2, 0, 0,
                0, 0, 0, 0
            ];
      const labelmap3D = buildLabelmap3D(SLICE_COUNT, {
        3: SHAPE_A,
        10: multiLabelSlice,
      });

      const generated = generateSegmentation(
        stack.images,
        labelmap3D,
        stack.metadataProvider,
        { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID }
      );
      const { dataset } = generated;

      expect(dataset.SOPClassUID).toBe(LABELMAP_SEG_SOP_CLASS_UID);
      expect(dataset.SegmentationType).toBe('LABELMAP');
      expect(String(dataset.BitsAllocated)).toBe('8');

      // dcmjs derive() wipes PerFrameFunctionalGroupsSequence; pre-fix
      // the exported frames had no plane position/orientation at all.
      const perFrame = dataset.PerFrameFunctionalGroupsSequence;
      expect(perFrame).toHaveLength(2);

      const positions = perFrame.map(
        (group) => firstItem(group.PlanePositionSequence)?.ImagePositionPatient
      );
      expect(positions.map((p) => p?.map(Number))).toEqual([
        [0, 0, 3],
        [0, 0, 10],
      ]);

      const orientations = perFrame.map(
        (group) =>
          firstItem(group.PlaneOrientationSequence)?.ImageOrientationPatient
      );
      orientations.forEach((orientation) => {
        expect(orientation?.map(Number)).toEqual([1, 0, 0, 0, 1, 0]);
      });

      // The SegmentIdentificationSequence macro must be absent on
      // LABELMAP frames (2h).
      perFrame.forEach((group) => {
        expect('SegmentIdentificationSequence' in group).toBe(false);
      });

      const { pixelsForSlice } = await readBack(stack, dataset);
      expect(pixelsForSlice(3)).toEqual(SHAPE_A);
      expect(pixelsForSlice(10)).toEqual(multiLabelSlice);
      expect(pixelsForSlice(0)).toEqual(EMPTY_SLICE);
    });
  });
});
