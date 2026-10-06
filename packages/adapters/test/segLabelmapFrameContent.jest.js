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

function exportLabelmap(pixelValuesBySlice, stackOptions) {
  const stack = makeReferencedStack(SLICE_COUNT, stackOptions);
  const { dataset } = generateSegmentation(
    stack.images,
    buildLabelmap3D(SLICE_COUNT, pixelValuesBySlice),
    stack.metadataProvider,
    { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID }
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

function sliceThickness(dataset) {
  return Number(
    firstItem(
      firstItem(dataset.SharedFunctionalGroupsSequence).PixelMeasuresSequence
    ).SliceThickness
  );
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
  });

  it('ranks frames along the slice normal, not by frame order', () => {
    const dataset = writeAndRead(
      exportLabelmap({ 3: SHAPE_A, 10: MULTI_LABEL }, { zDirection: -1 })
    );

    expectPositionOnlyDimensions(dataset);
    expect(frameZ(dataset)).toEqual([-3, -10]);
    expect(dimensionIndexValues(dataset)).toEqual([[2], [1]]);
  });

  it("takes the source's Slice Thickness for non-adjacent frames", () => {
    // The first two frames are 7 mm apart; the source slices are 1 mm thick.
    const dataset = writeAndRead(
      exportLabelmap({ 3: SHAPE_A, 10: MULTI_LABEL })
    );

    expect(sliceThickness(dataset)).toBe(1);
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
