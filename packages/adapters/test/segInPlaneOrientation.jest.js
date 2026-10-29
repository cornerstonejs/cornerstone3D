import { describe, it, expect } from '@jest/globals';
import ndarray from 'ndarray';
import checkOrientation from '../src/adapters/helpers/checkOrientation';
import {
  getValidOrientations,
  alignPixelDataWithSourceData,
} from '../src/adapters/Cornerstone/Segmentation_4X';
import { IN_PLANE_ORIENTATIONS, sampleSegFrame } from './helpers/segRoundTrip';

// segInPlaneOrientationImport.jest.js covers the 8 orientations end to end.
// This suite covers the inputs that the import fixtures do not produce.
const tolerance = 1e-3;
const sourceIop = [1, 0, 0, 0, 1, 0];

const multiframeWithSharedIop = (iop, segRows, segColumns) => ({
  Rows: segRows,
  Columns: segColumns,
  SharedFunctionalGroupsSequence: {
    PlaneOrientationSequence: { ImageOrientationPatient: iop },
  },
  PerFrameFunctionalGroupsSequence: [{}],
});

const orientation = (name) =>
  IN_PLANE_ORIENTATIONS.find(([orientationName]) => orientationName === name);

describe('in-plane SEG orientations', () => {
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

  it.each(['identity', 'rotated 180 degrees'])(
    'aligns a %s SEG when both IOPs are DS strings',
    (name) => {
      const [, segRow, segColumn] = orientation(name);
      const frame = sampleSegFrame(
        2,
        3,
        (i, j) => 1 + i * 3 + j,
        segRow,
        segColumn
      );
      const aligned = alignPixelDataWithSourceData(
        ndarray(Uint8Array.from(frame.values), [frame.rows, frame.columns]),
        [...segRow, ...segColumn].map(String),
        getValidOrientations(sourceIop.map(String)),
        tolerance
      );

      expect(Array.from(aligned.data)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  );

  it('keeps 16-bit LABELMAP values when it aligns a rotated frame', () => {
    const [, segRow, segColumn] = orientation('rotated 180 degrees');
    const labels = [300, 256, 0, 1, 0, 65535];
    const frame = sampleSegFrame(
      2,
      3,
      (i, j) => labels[i * 3 + j],
      segRow,
      segColumn
    );
    const aligned = alignPixelDataWithSourceData(
      ndarray(Uint16Array.from(frame.values), [frame.rows, frame.columns]),
      [...segRow, ...segColumn],
      getValidOrientations(sourceIop),
      tolerance
    );

    expect(aligned.data).toBeInstanceOf(Uint16Array);
    expect(Array.from(aligned.data)).toEqual(labels);
  });
});
