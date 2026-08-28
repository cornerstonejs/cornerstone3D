import { describe, it, expect } from '@jest/globals';
import { compactMergeSegmentDataWithoutInformationLoss } from '../src/adapters/Cornerstone3D/Segmentation/compactMergeSegData';

describe('compactMergeSegmentDataWithoutInformationLoss', () => {
  it('should have defined compactMergeSegmentDataWithoutInformationLoss', () => {
    expect(compactMergeSegmentDataWithoutInformationLoss).toBeDefined();
  });

  it('should use new array as first item if there are no initial arrays', () => {
    const arrayOfSegmentData = [];
    const newSegmentData = [
      [1, 2],
      [2, 3],
    ];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: newSegmentData,
    });

    expect(arrayOfSegmentData).toEqual([newSegmentData]);
  });

  it("should merge arrays when there's no overlapping", () => {
    const arrayOfSegmentData = [
      [
        [1, 0],
        [0, 1],
      ],
    ];
    const newSegmentData = [
      [0, 2],
      [2, 0],
    ];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: newSegmentData,
    });

    expect(arrayOfSegmentData).toEqual([
      [
        [1, 2],
        [2, 1],
      ],
    ]);
  });

  it('should not merge arrays when there is overlapping', () => {
    const arrayOfSegmentData = [
      [
        [1, 1],
        [0, 1],
      ],
    ];
    const newSegmentData = [
      [0, 2],
      [2, 0],
    ];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: newSegmentData,
    });

    expect(arrayOfSegmentData).toEqual([
      [
        [1, 1],
        [0, 1],
      ],

      [
        [0, 2],
        [2, 0],
      ],
    ]);
  });

  it('should merge with the second array when there is overlapping in the first but not in the second one', () => {
    const arrayOfSegmentData = [
      [
        [1, 1],
        [0, 1],
      ],
      [
        [1, 0],
        [0, 1],
      ],
    ];
    const newSegmentData = [
      [0, 2],
      [2, 0],
    ];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: newSegmentData,
    });

    expect(arrayOfSegmentData).toEqual([
      [
        [1, 1],
        [0, 1],
      ],

      [
        [1, 2],
        [2, 1],
      ],
    ]);
  });

  it('should keep undefined (empty) elements if both new and original array have them in the same position', () => {
    const arrayOfSegmentData = [[undefined, [0, 1]]];
    const newSegmentData = [undefined, [2, 0]];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: newSegmentData,
    });

    expect(arrayOfSegmentData).toEqual([[undefined, [2, 1]]]);
  });

  it('should keep the original elements if the corresponding new position is undefined (empty)', () => {
    const arrayOfSegmentData = [[[0, 1]]];
    const newSegmentData = [
      [0, 0],
      [2, 0],
    ];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: newSegmentData,
    });

    expect(arrayOfSegmentData).toEqual([
      [
        [0, 1],
        [2, 0],
      ],
    ]);
  });

  it('should keep the new elements if the corresponding original position is undefined (empty)', () => {
    const arrayOfSegmentData = [[undefined, [0, 1]]];
    const newSegmentData = [
      [2, 2],
      [2, 0],
    ];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: newSegmentData,
    });

    expect(arrayOfSegmentData).toEqual([
      [
        [2, 2],
        [2, 1],
      ],
    ]);
  });

  // getSegmentData() assigns only the indices that hold voxels, so its result is a SPARSE
  // array (real holes), not a dense one containing `undefined`. That distinction matters:
  // Array.prototype.forEach visits an `undefined` ELEMENT but skips a HOLE. Every test above
  // uses dense arrays, so none of them exercise this.
  it('should keep new data at indices the existing layer does not span (sparse arrays)', () => {
    // Existing layer holds images 3..4 — length 5, holes at 0..2.
    const existingLayer = [];
    existingLayer[3] = [1, 0];
    existingLayer[4] = [1, 0];

    // New segment holds images 1..3 — length 4, so the EXISTING layer is the longer one
    // and becomes `largerArray`. Indices 1 and 2 are outside the existing layer's
    // populated set and used to be dropped.
    const newSegmentData = [];
    newSegmentData[1] = [0, 2];
    newSegmentData[2] = [0, 2];
    newSegmentData[3] = [0, 2];

    const arrayOfSegmentData = [existingLayer];

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData,
    });

    // Merged into the single existing layer, keeping every image from both.
    expect(arrayOfSegmentData).toHaveLength(1);
    expect(arrayOfSegmentData[0][1]).toEqual([0, 2]);
    expect(arrayOfSegmentData[0][2]).toEqual([0, 2]);
    expect(arrayOfSegmentData[0][3]).toEqual([1, 2]);
    expect(arrayOfSegmentData[0][4]).toEqual([1, 0]);
  });
});
