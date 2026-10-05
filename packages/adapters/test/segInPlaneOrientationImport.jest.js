import { describe, it, expect, jest } from '@jest/globals';

// Runs SEGs in every in-plane orientation through the production import path
// (createFromDicomSegImageId -> createLabelmapsFromSegImageIds ->
// insertPixelDataPlanar). Only the derived-labelmap image factory is stubbed,
// as in the other SEG suites. The source images are 2 x 3.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        const pixelData = new Uint8Array(6);
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

const { imageLoader } = require('@cornerstonejs/core');
const {
  createFromDicomSegImageId,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateToolState');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  BINARY_SEG_SOP_CLASS_UID,
  CT_SOP_CLASS_UID,
  sopInstanceUidForSlice,
  makeReferencedStack,
} = require('./helpers/segRoundTrip');

// Non-square, so that a SEG rotated by 90 degrees has Rows and Columns swapped
// relative to the source.
const ROWS = 2;
const COLUMNS = 3;
const SLICE_COUNT = 2;
const TARGET_SLICE = 1;

// The segmentation as it should appear on the source grid. No in-plane
// rotation or flip maps it onto itself.
// prettier-ignore
const EXPECTED_LABELS = [
  1, 2, 0,
  0, 0, 3,
];

const r = [1, 0, 0];
const c = [0, 1, 0];
const negate = (v) => v.map((x) => -x);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const inPlaneOrientations = [
  ['identity', r, c],
  ['flipped rows', r, negate(c)],
  ['flipped columns', negate(r), c],
  ['rotated 90 degrees', c, negate(r)],
  ['transposed', c, r],
  ['anti-transposed', negate(c), negate(r)],
  ['rotated 180 degrees', negate(r), negate(c)],
  ['rotated 270 degrees', negate(c), r],
];

/**
 * Samples EXPECTED_LABELS onto a SEG frame with the given row and column
 * cosines, as an encoder writing that orientation would. Source pixel
 * (row i, column j) of the target slice is at world (j, i, TARGET_SLICE).
 */
function makeSegFrame(segRow, segColumn) {
  const extent = [COLUMNS - 1, ROWS - 1, 0];
  const corners = [
    [0, 0, 0],
    [extent[0], 0, 0],
    [0, extent[1], 0],
    [extent[0], extent[1], 0],
  ];
  const columns = Math.abs(dot(segRow, extent)) + 1;
  const rows = Math.abs(dot(segColumn, extent)) + 1;
  const rowStart = Math.min(...corners.map((p) => dot(p, segRow)));
  const columnStart = Math.min(...corners.map((p) => dot(p, segColumn)));

  const labels = new Uint8Array(rows * columns);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const world = [0, 1, 2].map(
        (k) => (rowStart + j) * segRow[k] + (columnStart + i) * segColumn[k]
      );
      labels[i * columns + j] = EXPECTED_LABELS[world[1] * COLUMNS + world[0]];
    }
  }

  const imagePositionPatient = [0, 1, 2].map(
    (k) => rowStart * segRow[k] + columnStart * segColumn[k]
  );
  imagePositionPatient[2] = TARGET_SLICE;

  return { rows, columns, labels, imagePositionPatient };
}

/**
 * A naturalized SEG instance with the frame in the given orientation: one
 * frame for a LABELMAP SEG, or one frame per segment for a BINARY SEG.
 */
function buildSeg(segmentationType, segRow, segColumn) {
  const frame = makeSegFrame(segRow, segColumn);
  const isLabelmap = segmentationType === 'LABELMAP';
  const framePixels = isLabelmap
    ? [frame.labels]
    : [1, 2, 3].map((segmentNumber) =>
        frame.labels.map((label) => (label === segmentNumber ? 1 : 0))
      );

  const multiframe = {
    SOPClassUID: isLabelmap
      ? LABELMAP_SEG_SOP_CLASS_UID
      : BINARY_SEG_SOP_CLASS_UID,
    SOPInstanceUID: '1.2.826.0.1.3680043.8.498.888',
    Modality: 'SEG',
    SegmentationType: segmentationType,
    Rows: frame.rows,
    Columns: frame.columns,
    NumberOfFrames: framePixels.length,
    BitsAllocated: isLabelmap ? 8 : 1,
    BitsStored: isLabelmap ? 8 : 1,
    HighBit: isLabelmap ? 7 : 0,
    SharedFunctionalGroupsSequence: {
      PlaneOrientationSequence: {
        ImageOrientationPatient: [...segRow, ...segColumn],
      },
      PixelMeasuresSequence: { PixelSpacing: [1, 1], SliceThickness: 1 },
    },
    PerFrameFunctionalGroupsSequence: framePixels.map((_, frameIndex) => ({
      PlanePositionSequence: {
        ImagePositionPatient: frame.imagePositionPatient,
      },
      DerivationImageSequence: {
        SourceImageSequence: {
          ReferencedSOPClassUID: CT_SOP_CLASS_UID,
          ReferencedSOPInstanceUID: sopInstanceUidForSlice(TARGET_SLICE),
        },
      },
      ...(isLabelmap
        ? {}
        : {
            SegmentIdentificationSequence: {
              ReferencedSegmentNumber: frameIndex + 1,
            },
          }),
    })),
    SegmentSequence: [1, 2, 3].map((segmentNumber) => ({
      SegmentNumber: segmentNumber,
      SegmentLabel: `Segment ${segmentNumber}`,
      SegmentAlgorithmType: 'MANUAL',
    })),
  };

  return { multiframe, framePixels };
}

let schemeCount = 0;

async function importSeg(segmentationType, segRow, segColumn) {
  const stack = makeReferencedStack(SLICE_COUNT, {
    rows: ROWS,
    columns: COLUMNS,
  });
  const { multiframe, framePixels } = buildSeg(
    segmentationType,
    segRow,
    segColumn
  );

  // A fresh scheme per import keeps frame imageIds out of each other's cache.
  const scheme = `seginplane${++schemeCount}`;
  const segImageId = `${scheme}:seg-instance`;
  const frameImageIds = framePixels.map(
    (_, frameIndex) => `${scheme}:frame-${frameIndex + 1}`
  );
  imageLoader.registerImageLoader(scheme, (imageId) => ({
    promise: Promise.resolve({
      imageId,
      getPixelData: () => framePixels[frameImageIds.indexOf(imageId)],
    }),
    cancelFn: undefined,
  }));

  const metadataProvider = {
    get: (type, imageId) =>
      type === 'instance' && imageId === segImageId
        ? multiframe
        : stack.metadataProvider.get(type, imageId),
  };

  const result = await createFromDicomSegImageId(stack.imageIds, segImageId, {
    metadataProvider,
    frameImageIds,
  });

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

describe.each(['LABELMAP', 'BINARY'])(
  'importing a %s SEG on a non-square source',
  (segmentationType) => {
    it.each(inPlaneOrientations)(
      '%s SEG is placed on the source grid',
      async (_, segRow, segColumn) => {
        const pixelsForSlice = await importSeg(
          segmentationType,
          segRow,
          segColumn
        );

        expect(pixelsForSlice(TARGET_SLICE)).toEqual(EXPECTED_LABELS);
        expect(pixelsForSlice(0)).toEqual(new Array(ROWS * COLUMNS).fill(0));
      }
    );
  }
);
