import { describe, it, expect } from '@jest/globals';
import ndarray from 'ndarray';
import checkOrientation from '../src/adapters/helpers/checkOrientation';
import {
  getValidOrientations,
  alignPixelDataWithSourceData,
} from '../src/adapters/Cornerstone/Segmentation_4X';

// The source is an axial acquisition of 4 rows x 3 columns with unit spacing:
// pixel (row i, column j) is at world (j, i, 0). It is non-square so that 90
// degree rotations change the frame shape.
const rows = 4;
const columns = 3;
const r = [1, 0, 0];
const c = [0, 1, 0];
const sourceIop = [...r, ...c];
const tolerance = 1e-3;

const negate = (v) => v.map((x) => -x);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Every way a SEG frame can share the source plane and pixel grid.
// See https://github.com/cornerstonejs/cornerstone3D/issues/2959
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

function makeSource() {
  const source = ndarray(new Uint8Array(rows * columns), [rows, columns]);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      source.set(i, j, 1 + i * columns + j);
    }
  }
  return source;
}

/**
 * Samples the source onto a SEG frame with the given row and column cosines
 * covering the same pixels, as an encoder writing that orientation would.
 */
function makeSegFrame(source, segRow, segColumn) {
  const extent = [columns - 1, rows - 1, 0];
  const corners = [
    [0, 0, 0],
    [extent[0], 0, 0],
    [0, extent[1], 0],
    [extent[0], extent[1], 0],
  ];
  const segColumns = Math.abs(dot(segRow, extent)) + 1;
  const segRows = Math.abs(dot(segColumn, extent)) + 1;
  // The SEG origin is the corner that comes first along both SEG axes.
  const rowStart = Math.min(...corners.map((p) => dot(p, segRow)));
  const columnStart = Math.min(...corners.map((p) => dot(p, segColumn)));

  const frame = ndarray(new Uint8Array(segRows * segColumns), [
    segRows,
    segColumns,
  ]);
  for (let i = 0; i < segRows; i++) {
    for (let j = 0; j < segColumns; j++) {
      const world = [0, 1, 2].map(
        (k) => (rowStart + j) * segRow[k] + (columnStart + i) * segColumn[k]
      );
      frame.set(i, j, source.get(world[1], world[0]));
    }
  }
  return frame;
}

function toRows(matrix) {
  const [matrixRows, matrixColumns] = matrix.shape;
  const result = [];
  for (let i = 0; i < matrixRows; i++) {
    const row = [];
    for (let j = 0; j < matrixColumns; j++) {
      row.push(matrix.get(i, j));
    }
    result.push(row);
  }
  return result;
}

const multiframeWithSharedIop = (iop, segRows, segColumns) => ({
  Rows: segRows,
  Columns: segColumns,
  SharedFunctionalGroupsSequence: {
    PlaneOrientationSequence: { ImageOrientationPatient: iop },
  },
  PerFrameFunctionalGroupsSequence: [{}],
});

describe('in-plane SEG orientations', () => {
  const validOrientations = getValidOrientations(sourceIop);

  it.each(inPlaneOrientations)(
    '%s SEG is classified as Planar',
    (_, segRow, segColumn) => {
      const frame = makeSegFrame(makeSource(), segRow, segColumn);
      const multiframe = multiframeWithSharedIop(
        [...segRow, ...segColumn],
        ...frame.shape
      );
      expect(
        checkOrientation(
          multiframe,
          validOrientations,
          [rows, columns, 1],
          tolerance
        )
      ).toBe('Planar');
    }
  );

  it.each(inPlaneOrientations)(
    '%s SEG frame is aligned with the source pixels',
    (_, segRow, segColumn) => {
      const source = makeSource();
      const frame = makeSegFrame(source, segRow, segColumn);
      const aligned = alignPixelDataWithSourceData(
        frame,
        [...segRow, ...segColumn],
        validOrientations,
        tolerance
      );
      expect(aligned.shape).toEqual([rows, columns]);
      expect(toRows(aligned)).toEqual(toRows(source));
    }
  );

  it('classifies a SEG rotated 180 degrees from a slightly oblique axial source as Planar', () => {
    // Geometry of an IDC upenn_gbm MR and its bamf_aimi_annotations SEG, which
    // previously failed with "Segmentations orthogonal to the acquisition
    // plane of the source data are not yet supported."
    const mrIop = [
      0.9999984769134, -0.0017453283007, 0, 0.00174532830068, 0.9999984769134,
      0,
    ];
    const segIop = [
      '-0.99999845',
      '0.00174532831',
      '0',
      '-0.00174532831',
      '-0.99999845',
      '0',
    ];
    expect(
      checkOrientation(
        multiframeWithSharedIop(segIop, 256, 192),
        getValidOrientations(mrIop),
        [256, 192, 192],
        tolerance
      )
    ).toBe('Planar');
  });
});
