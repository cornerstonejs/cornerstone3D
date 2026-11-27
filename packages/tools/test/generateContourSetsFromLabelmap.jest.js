import { describe, it, expect, jest } from '@jest/globals';

// The contour conversion runs in a web worker. Stub the worker so it returns
// one contour set per requested segment, with contours only for segments 2 and 3.
const mockExecuteTask = jest.fn();
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  const volume = {
    imageIds: [],
    dimensions: [2, 2, 1],
    metadata: { FrameOfReferenceUID: '1.2.3' },
    voxelManager: { getCompleteScalarDataArray: () => [0, 2, 0, 3] },
    imageData: {
      getSpacing: () => [1, 1, 1],
      getOrigin: () => [0, 0, 0],
      getDirection: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
    },
  };
  return {
    ...actual,
    cache: { ...actual.cache, getVolume: () => volume, getImage: () => null },
    getWebWorkerManager: () => ({ executeTask: mockExecuteTask }),
  };
});
jest.mock('../src/utilities/registerComputeWorker', () => ({
  registerComputeWorker: () => undefined,
}));
jest.mock('../src/utilities/segmentation/utilsForWorker', () => ({
  triggerWorkerProgress: () => undefined,
}));

const {
  generateContourSetsFromLabelmap,
} = require('../src/utilities/contours/generateContourSetsFromLabelmap');

const sliceContour = {
  contours: [{ type: 'CLOSED_PLANAR', contourPoints: [0] }],
  polyData: { points: [] },
  sliceIndex: 0,
};

describe('generateContourSetsFromLabelmap', () => {
  it('tags each contour set with its segment index when an empty segment is skipped', async () => {
    mockExecuteTask.mockResolvedValue([
      { segment: { segmentIndex: 1 }, sliceContours: [] },
      { segment: { segmentIndex: 2 }, sliceContours: [sliceContour] },
      { segment: { segmentIndex: 3 }, sliceContours: [sliceContour] },
    ]);

    const contourSets = await generateContourSetsFromLabelmap({
      segmentations: {
        segmentationId: 'seg',
        representationData: { Labelmap: { volumeId: 'seg' } },
        segments: {
          1: { segmentIndex: 1, label: 'Liver' },
          2: { segmentIndex: 2, label: 'Spleen' },
          3: { segmentIndex: 3, label: 'Kidney' },
        },
      },
    });

    expect(
      contourSets.map(({ segmentIndex, label }) => ({ segmentIndex, label }))
    ).toEqual([
      { segmentIndex: 2, label: 'Spleen' },
      { segmentIndex: 3, label: 'Kidney' },
    ]);
  });
});
