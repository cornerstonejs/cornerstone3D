import { describe, it, expect } from '@jest/globals';
import { data as dcmjsData } from 'dcmjs';

const {
  generateSegmentation,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  BINARY_SEG_SOP_CLASS_UID,
  makeReferencedStack,
  buildLabelmap3D,
  datasetToPart10Buffer,
  firstItem,
} = require('./helpers/segRoundTrip');

const { DicomMessage, DicomMetaDictionary } = dcmjsData;

const SLICE_COUNT = 12;
const IMAGE_POSITION_PATIENT_TAG = 0x00200032;
const PLANE_POSITION_SEQUENCE_TAG = 0x00209113;
const STACK_ID_TAG = 0x00209056;
const IN_STACK_POSITION_NUMBER_TAG = 0x00209057;
const REFERENCED_SEGMENT_NUMBER_TAG = 0x0062000b;

// prettier-ignore
const SHAPE_A = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];
// prettier-ignore
const MULTI_LABEL = [
    1, 1, 0, 0,
    0, 0, 0, 0,
    2, 2, 0, 0,
    0, 0, 0, 0
];

function asList(sequence) {
  if (Array.isArray(sequence)) {
    return sequence;
  }
  return sequence ? [sequence] : [];
}

function exportLabelmap(pixelValuesBySlice, stackOptions, exportOptions) {
  const stack = makeReferencedStack(SLICE_COUNT, stackOptions);
  const { dataset } = generateSegmentation(
    stack.images,
    buildLabelmap3D(SLICE_COUNT, pixelValuesBySlice),
    stack.metadataProvider,
    { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID, ...exportOptions }
  );
  return dataset;
}

// What a reader such as pydicom sees: the dataset after a Part 10 write/read.
function writeAndRead(dataset) {
  const dicomData = DicomMessage.readFile(datasetToPart10Buffer(dataset));
  return DicomMetaDictionary.naturalizeDataset(dicomData.dict);
}

function dimensionIndexValues(dataset) {
  return asList(dataset.PerFrameFunctionalGroupsSequence).map((group) =>
    asList(firstItem(group.FrameContentSequence)?.DimensionIndexValues).map(
      Number
    )
  );
}

function frameZ(dataset) {
  return asList(dataset.PerFrameFunctionalGroupsSequence).map((group) =>
    Number(firstItem(group.PlanePositionSequence).ImagePositionPatient[2])
  );
}

function sharedGroup(dataset) {
  return firstItem(dataset.SharedFunctionalGroupsSequence);
}

function sliceThickness(dataset) {
  return Number(
    firstItem(sharedGroup(dataset).PixelMeasuresSequence).SliceThickness
  );
}

function dimensionPointers(dataset) {
  return asList(dataset.DimensionIndexSequence).map((dimension) =>
    Number(dimension.DimensionIndexPointer)
  );
}

function stackContents(dataset) {
  return asList(dataset.PerFrameFunctionalGroupsSequence).map((group) => {
    const content = firstItem(group.FrameContentSequence);
    return [content.StackID, Number(content.InStackPositionNumber)];
  });
}

function expectPositionOnlyDimensions(dataset) {
  const dimensions = asList(dataset.DimensionIndexSequence);
  expect(dimensions).toHaveLength(1);
  expect(Number(dimensions[0].DimensionIndexPointer)).toBe(
    IMAGE_POSITION_PATIENT_TAG
  );
  expect(Number(dimensions[0].FunctionalGroupPointer)).toBe(
    PLANE_POSITION_SEQUENCE_TAG
  );
  expect(dimensions[0].DimensionOrganizationUID).toBe(
    firstItem(dataset.DimensionOrganizationSequence).DimensionOrganizationUID
  );
}

describe('LABELMAP SEG export Frame Content', () => {
  it('writes a Frame Content Sequence on every frame, indexed by position alone', () => {
    const dataset = writeAndRead(
      exportLabelmap({ 3: SHAPE_A, 10: MULTI_LABEL })
    );

    expect(dataset.SegmentationType).toBe('LABELMAP');
    expectPositionOnlyDimensions(dataset);
    expect(frameZ(dataset)).toEqual([3, 10]);
    expect(dimensionIndexValues(dataset)).toEqual([[1], [2]]);
    // One orientation is in the shared group only (PS3.3 C.7.6.16).
    expect(
      firstItem(
        sharedGroup(dataset).PlaneOrientationSequence
      ).ImageOrientationPatient.map(Number)
    ).toEqual([1, 0, 0, 0, 1, 0]);
    asList(dataset.PerFrameFunctionalGroupsSequence).forEach((group) => {
      expect(group.PlaneOrientationSequence).toBeUndefined();
    });
  });

  it('ranks frames along the slice normal, not by frame order', () => {
    const dataset = writeAndRead(
      exportLabelmap({ 3: SHAPE_A, 10: MULTI_LABEL }, { zDirection: -1 })
    );

    expectPositionOnlyDimensions(dataset);
    expect(frameZ(dataset)).toEqual([-3, -10]);
    expect(dimensionIndexValues(dataset)).toEqual([[2], [1]]);
  });

  it('puts a second frame on the same plane in a second stack', () => {
    // Slices 3 and 5 are both on the plane z = 3, with different origins.
    const dataset = writeAndRead(
      exportLabelmap(
        { 2: SHAPE_A, 3: SHAPE_A, 5: MULTI_LABEL },
        {
          positionForSlice: (slice) =>
            slice === 5 ? [10, 0, 3] : [0, 0, slice],
        }
      )
    );

    expect(dimensionPointers(dataset)).toEqual([
      STACK_ID_TAG,
      IN_STACK_POSITION_NUMBER_TAG,
    ]);
    expect(stackContents(dataset)).toEqual([
      ['1', 1],
      ['1', 2],
      ['2', 1],
    ]);
    expect(dimensionIndexValues(dataset)).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it('puts each orientation in its own stack, with per-frame orientation', () => {
    const sagittal = [0, 1, 0, 0, 0, -1];
    const dataset = writeAndRead(
      exportLabelmap(
        { 2: SHAPE_A, 4: SHAPE_A, 6: MULTI_LABEL },
        {
          orientationForSlice: (slice) =>
            slice === 4 ? sagittal : [1, 0, 0, 0, 1, 0],
        }
      )
    );

    expect(stackContents(dataset)).toEqual([
      ['1', 1],
      ['2', 1],
      ['1', 2],
    ]);
    expect(sharedGroup(dataset).PlaneOrientationSequence).toBeUndefined();
    expect(
      asList(dataset.PerFrameFunctionalGroupsSequence).map((group) =>
        firstItem(group.PlaneOrientationSequence).ImageOrientationPatient.map(
          Number
        )
      )
    ).toEqual([[1, 0, 0, 0, 1, 0], sagittal, [1, 0, 0, 0, 1, 0]]);
  });

  it('refuses a frame without a plane', () => {
    expect(() =>
      exportLabelmap(
        { 3: SHAPE_A, 6: MULTI_LABEL },
        {
          orientationForSlice: (slice) =>
            slice === 6 ? undefined : [1, 0, 0, 0, 1, 0],
        }
      )
    ).toThrow(/frame 2 has no ImagePositionPatient or ImageOrientationPatient/);
  });

  it("takes the source's Slice Thickness and spacing for non-adjacent frames", () => {
    // The first two frames are 7 mm apart; the source slices are 1 mm apart.
    const dataset = writeAndRead(
      exportLabelmap(
        { 3: SHAPE_A, 10: MULTI_LABEL },
        {},
        { includeSliceSpacing: true }
      )
    );
    const pixelMeasures = firstItem(sharedGroup(dataset).PixelMeasuresSequence);

    expect(sliceThickness(dataset)).toBe(1);
    expect(Number(pixelMeasures.SpacingBetweenSlices)).toBe(1);
  });

  it('omits Spacing Between Slices when the source has a missing slice', () => {
    // The source has no slice at z = 6, so one gap is 2 mm.
    const dataset = writeAndRead(
      exportLabelmap(
        { 3: SHAPE_A, 8: MULTI_LABEL },
        { positionForSlice: (slice) => [0, 0, slice < 6 ? slice : slice + 1] },
        { includeSliceSpacing: true }
      )
    );
    const pixelMeasures = firstItem(sharedGroup(dataset).PixelMeasuresSequence);

    expect(pixelMeasures.SpacingBetweenSlices).toBeUndefined();
    expect(sliceThickness(dataset)).toBe(1);
  });

  it('writes per-frame Pixel Measures when the source images differ', () => {
    const dataset = writeAndRead(
      exportLabelmap(
        { 3: SHAPE_A, 6: MULTI_LABEL },
        {
          pixelSpacingForSlice: (slice) => (slice < 5 ? [1, 1] : [0.5, 0.5]),
          sliceThicknessForSlice: (slice) => (slice < 5 ? 1 : 5),
        }
      )
    );

    // Shared Functional Groups Sequence is Type 2, so it can have no item.
    expect(sharedGroup(dataset)?.PixelMeasuresSequence).toBeUndefined();
    expect(
      asList(dataset.PerFrameFunctionalGroupsSequence).map((group) => {
        const measures = firstItem(group.PixelMeasuresSequence);
        return [
          measures.PixelSpacing.map(Number),
          Number(measures.SliceThickness),
        ];
      })
    ).toEqual([
      [[1, 1], 1],
      [[0.5, 0.5], 5],
    ]);
  });

  it('keeps a plane orientation when the source has no Pixel Spacing', () => {
    // The plane module flags a default Pixel Spacing, but its axial
    // orientation is real, and the instance has none.
    const dataset = writeAndRead(
      exportLabelmap(
        { 2: SHAPE_A, 4: SHAPE_A },
        {
          planeOrientationOnly: (slice) => slice === 4,
          pixelSpacingForSlice: (slice) => (slice === 4 ? undefined : [1, 1]),
        }
      )
    );

    expectPositionOnlyDimensions(dataset);
    expect(
      firstItem(
        sharedGroup(dataset).PlaneOrientationSequence
      ).ImageOrientationPatient.map(Number)
    ).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("gives a single-frame export a Frame Content Sequence and the source's Slice Thickness", () => {
    const dataset = writeAndRead(exportLabelmap({ 5: MULTI_LABEL }));

    expect(Number(dataset.NumberOfFrames)).toBe(1);
    expectPositionOnlyDimensions(dataset);
    expect(dimensionIndexValues(dataset)).toEqual([[1]]);
    expect(sliceThickness(dataset)).toBe(1);
  });
});

describe('BINARY SEG export Frame Content', () => {
  it('keeps the segment-then-position dimensions dcmjs writes', () => {
    const stack = makeReferencedStack(SLICE_COUNT, { zDirection: -1 });
    const { dataset: generated } = generateSegmentation(
      stack.images,
      buildLabelmap3D(SLICE_COUNT, { 10: SHAPE_A, 11: SHAPE_A }),
      stack.metadataProvider
    );
    const dataset = writeAndRead(generated);

    expect(dataset.SOPClassUID).toBe(BINARY_SEG_SOP_CLASS_UID);
    expect(
      asList(dataset.DimensionIndexSequence).map((dimension) =>
        Number(dimension.DimensionIndexPointer)
      )
    ).toEqual([REFERENCED_SEGMENT_NUMBER_TAG, IMAGE_POSITION_PATIENT_TAG]);
    expect(dimensionIndexValues(dataset)).toEqual([
      [1, 11],
      [1, 12],
    ]);
    asList(dataset.PerFrameFunctionalGroupsSequence).forEach((group) => {
      expect(
        Number(
          firstItem(group.SegmentIdentificationSequence).ReferencedSegmentNumber
        )
      ).toBe(1);
    });
  });
});
