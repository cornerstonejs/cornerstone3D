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
    // dcmjs sorts the referenced multiframe by position, so each frame must
    // take its plane from its own source image, in either scan direction.
    it.each([
      ['ascending', 1],
      ['descending', -1],
    ])(
      'derives, references the correct source slices, and reads back onto them (%s z)',
      async (_, zDirection) => {
        const stack = makeReferencedStack(SLICE_COUNT, { zDirection });
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

        // And carry that slice's geometry, not the mirrored slice's.
        const positions = perFrame.map(
          (group) =>
            firstItem(group.PlanePositionSequence)?.ImagePositionPatient
        );
        expect(positions.map((p) => p?.map(Number))).toEqual([
          [0, 0, zDirection * 10],
          [0, 0, zDirection * 11],
        ]);

        const { pixelsForSlice } = await readBack(stack, dataset);
        expect(pixelsForSlice(10)).toEqual(SHAPE_A);
        expect(pixelsForSlice(11)).toEqual(SHAPE_B);
        expect(pixelsForSlice(0)).toEqual(EMPTY_SLICE);
        expect(pixelsForSlice(1)).toEqual(EMPTY_SLICE);

        // A reader that places frames by their plane only, as for a SEG
        // without source references, finds the same slices.
        perFrame.forEach((group) => delete group.DerivationImageSequence);
        delete dataset.SourceImageSequence;
        const byGeometry = await readBack(stack, dataset);
        expect(byGeometry.pixelsForSlice(10)).toEqual(SHAPE_A);
        expect(byGeometry.pixelsForSlice(11)).toEqual(SHAPE_B);
        expect(byGeometry.pixelsForSlice(0)).toEqual(EMPTY_SLICE);
        expect(byGeometry.pixelsForSlice(1)).toEqual(EMPTY_SLICE);
      }
    );

    it('gives each frame the orientation of its own source image', () => {
      // Two orientations, ascending z. dcmjs writes one shared orientation,
      // so the adapter must move the orientations to the per-frame groups.
      const tilted = [1, 0, 0, 0, 0.8, 0.6];
      const orientationForSlice = (sliceIndex) =>
        sliceIndex % 2 ? tilted : [1, 0, 0, 0, 1, 0];
      const stack = makeReferencedStack(SLICE_COUNT, { orientationForSlice });
      const labelmap3D = buildLabelmap3D(SLICE_COUNT, {
        2: SHAPE_A,
        9: SHAPE_B,
      });

      const { dataset } = generateSegmentation(
        stack.images,
        labelmap3D,
        stack.metadataProvider
      );

      const orientations = dataset.PerFrameFunctionalGroupsSequence.map(
        (group) =>
          firstItem(group.PlaneOrientationSequence)?.ImageOrientationPatient
      );
      expect(orientations.map((o) => o?.map(Number))).toEqual([
        orientationForSlice(2),
        orientationForSlice(9),
      ]);
      // A per-frame orientation and a shared one would contradict each other.
      expect(
        firstItem(dataset.SharedFunctionalGroupsSequence)
          .PlaneOrientationSequence
      ).toBeUndefined();
    });

    it('shares one orientation when all exported frames have the same', () => {
      // dcmjs takes the shared orientation from the slice that is farthest
      // along the normal: here the last slice, which is tilted and not exported.
      const tilted = [1, 0, 0, 0, 0.8, 0.6];
      const orientationForSlice = (sliceIndex) =>
        sliceIndex === SLICE_COUNT - 1 ? tilted : [1, 0, 0, 0, 1, 0];
      const stack = makeReferencedStack(SLICE_COUNT, { orientationForSlice });
      const labelmap3D = buildLabelmap3D(SLICE_COUNT, {
        2: SHAPE_A,
        9: SHAPE_B,
      });

      const { dataset } = generateSegmentation(
        stack.images,
        labelmap3D,
        stack.metadataProvider
      );

      expect(
        firstItem(
          firstItem(dataset.SharedFunctionalGroupsSequence)
            .PlaneOrientationSequence
        ).ImageOrientationPatient.map(Number)
      ).toEqual([1, 0, 0, 0, 1, 0]);
      dataset.PerFrameFunctionalGroupsSequence.forEach((group) =>
        expect(group.PlaneOrientationSequence).toBeUndefined()
      );
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

      // One orientation is shared; a per-frame value would override it.
      const shared = firstItem(dataset.SharedFunctionalGroupsSequence);
      const orientations = perFrame.map(
        (group) =>
          firstItem(
            group.PlaneOrientationSequence ?? shared.PlaneOrientationSequence
          )?.ImageOrientationPatient
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
