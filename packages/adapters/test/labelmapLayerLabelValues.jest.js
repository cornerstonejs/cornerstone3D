import { describe, it, expect } from '@jest/globals';

const {
  generateSegmentation,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  makeReferencedStack,
  buildLabelmap3D,
  firstItem,
} = require('./helpers/segRoundTrip');

const SLICE_COUNT = 4;

// prettier-ignore
const ROW_STROKE = [
    0, 0, 0, 0,
    1, 1, 1, 1,
    0, 0, 0, 0,
    0, 0, 0, 0
];
// prettier-ignore
const COLUMN_STROKE = [
    0, 1, 0, 0,
    0, 1, 0, 0,
    0, 1, 0, 0,
    0, 1, 0, 0
];

/** Segment metadata for segments 1 and 2, as a consumer gives it to each layer. */
function withSegments(labelmap3D) {
  const template = labelmap3D.metadata[1];
  labelmap3D.metadata = [
    undefined,
    { ...template, SegmentNumber: '1', SegmentLabel: 'Segment 1' },
    { ...template, SegmentNumber: '2', SegmentLabel: 'Segment 2' },
  ];
  return labelmap3D;
}

describe('labelmap layers that store a segment under another label value', () => {
  it('writes the segment of an overlap layer under its own segment in a binary SEG', () => {
    const stack = makeReferencedStack(SLICE_COUNT, { zDirection: -1 });
    const sharedLayer = withSegments(
      buildLabelmap3D(SLICE_COUNT, { 1: ROW_STROKE })
    );
    // A private overlap layer: segment 2 is stored as label value 1.
    const overlapLayer = withSegments(
      buildLabelmap3D(SLICE_COUNT, { 1: COLUMN_STROKE })
    );
    overlapLayer.labelToSegmentIndex = { 1: 2 };

    const { dataset } = generateSegmentation(
      stack.images,
      [sharedLayer, overlapLayer],
      stack.metadataProvider
    );

    const segments = [].concat(dataset.SegmentSequence);
    expect(segments.map((segment) => segment.SegmentLabel)).toEqual([
      'Segment 1',
      'Segment 2',
    ]);
    const referencedSegmentNumbers =
      dataset.PerFrameFunctionalGroupsSequence.map((group) =>
        Number(
          firstItem(group.SegmentIdentificationSequence).ReferencedSegmentNumber
        )
      );
    expect(referencedSegmentNumbers).toEqual([1, 2]);
  });

  it('writes one SEG segment when two label values have the same segment index', () => {
    const stack = makeReferencedStack(SLICE_COUNT);
    // Label value 1 is bound to segment 2, and label value 2 has no binding,
    // so it is also segment 2.
    const overlapLayer = withSegments(
      buildLabelmap3D(SLICE_COUNT, {
        1: COLUMN_STROKE,
        2: COLUMN_STROKE.map((value) => value * 2),
      })
    );
    overlapLayer.labelToSegmentIndex = { 1: 2 };

    const { dataset } = generateSegmentation(
      stack.images,
      overlapLayer,
      stack.metadataProvider
    );

    const segments = [].concat(dataset.SegmentSequence);
    expect(segments.map((segment) => segment.SegmentLabel)).toEqual([
      'Segment 2',
    ]);
    expect(dataset.PerFrameFunctionalGroupsSequence).toHaveLength(2);
  });

  it('writes the segment index, not the label value, in a LABELMAP SEG', () => {
    const stack = makeReferencedStack(SLICE_COUNT);
    // The only layer is a private layer: segment 2 is stored as label value 1.
    const overlapLayer = withSegments(
      buildLabelmap3D(SLICE_COUNT, { 1: COLUMN_STROKE })
    );
    overlapLayer.labelToSegmentIndex = { 1: 2 };

    const { dataset } = generateSegmentation(
      stack.images,
      overlapLayer,
      stack.metadataProvider,
      { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID }
    );

    const frame = new Uint8Array(
      [].concat(dataset.PixelData)[0],
      0,
      COLUMN_STROKE.length
    );
    expect(Array.from(frame)).toEqual(COLUMN_STROKE.map((value) => value * 2));
  });
});
