import { describe, it, expect } from '@jest/globals';
import checkOrientation from '../src/adapters/helpers/checkOrientation';

// The source data is a standard axial acquisition (row cosines [1,0,0],
// column cosines [0,1,0]). validOrientations holds numeric cosines because they
// are derived from the source image's parsed imagePlaneModule.
const validOrientations = [[1, 0, 0, 0, 1, 0]];
const sourceDataDimensions = [512, 512, 1];
const tolerance = 1e-3;

const multiframeWithSharedIop = (iop) => ({
  Rows: 512,
  Columns: 512,
  SharedFunctionalGroupsSequence: {
    PlaneOrientationSequence: { ImageOrientationPatient: iop },
  },
  PerFrameFunctionalGroupsSequence: [{}],
});

describe('checkOrientation', () => {
  it('classifies a co-planar SEG as Planar when ImageOrientationPatient is numeric', () => {
    const multiframe = multiframeWithSharedIop([1, 0, 0, 0, 1, 0]);
    expect(
      checkOrientation(
        multiframe,
        validOrientations,
        sourceDataDimensions,
        tolerance
      )
    ).toBe('Planar');
  });

  it('classifies a co-planar SEG as Planar when ImageOrientationPatient is DICOM DS strings', () => {
    // Regression: DICOMweb JSON metadata delivers DS values as strings. The
    // orientation check compares them against numeric source cosines with a
    // type-strict equality, which previously misclassified this perfectly
    // in-plane SEG as orthogonal ("Segmentations orthogonal to the acquisition
    // plane of the source data are not yet supported.").
    const multiframe = multiframeWithSharedIop(['1', '0', '0', '0', '1', '0']);
    expect(
      checkOrientation(
        multiframe,
        validOrientations,
        sourceDataDimensions,
        tolerance
      )
    ).toBe('Planar');
  });

  it('still classifies a genuinely perpendicular SEG as Perpendicular (string IOP)', () => {
    // Row cosines [1,0,0], column cosines [0,0,-1]: perpendicular to the axial
    // source. Coercion must not mask real perpendicular segmentations.
    const multiframe = multiframeWithSharedIop(['1', '0', '0', '0', '0', '-1']);
    expect(
      checkOrientation(
        multiframe,
        validOrientations,
        sourceDataDimensions,
        tolerance
      )
    ).toBe('Perpendicular');
  });

  it('falls back to the per-frame ImageOrientationPatient when no shared group is present', () => {
    const multiframe = {
      Rows: 512,
      Columns: 512,
      SharedFunctionalGroupsSequence: {},
      PerFrameFunctionalGroupsSequence: [
        {
          PlaneOrientationSequence: {
            ImageOrientationPatient: ['1', '0', '0', '0', '1', '0'],
          },
        },
      ],
    };
    expect(
      checkOrientation(
        multiframe,
        validOrientations,
        sourceDataDimensions,
        tolerance
      )
    ).toBe('Planar');
  });
});
