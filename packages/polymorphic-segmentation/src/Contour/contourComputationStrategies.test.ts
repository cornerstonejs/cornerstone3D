import { computeContourFromLabelmapSegmentation } from './contourComputationStrategies';
import { clipAndCacheSurfacesForViewport } from '../utilities/clipAndCacheSurfacesForViewport';

jest.mock('@cornerstonejs/core', () => ({
  cache: { getGeometry: jest.fn() },
  utilities: {
    logger: {
      polySegLog: { getLogger: () => ({ error: jest.fn() }) },
    },
  },
}));

jest.mock('@cornerstonejs/tools', () => ({
  Enums: { SegmentationRepresentations: { Contour: 'Contour' } },
  segmentation: {
    state: { getSegmentation: jest.fn() },
    segmentationStyle: { setStyle: jest.fn() },
  },
  utilities: { segmentation: { getUniqueSegmentIndices: jest.fn(() => [1]) } },
}));

jest.mock('../Surface/surfaceComputationStrategies', () => ({
  computeSurfaceFromLabelmapSegmentation: jest.fn(async () => [
    { segmentIndex: 1, data: { points: [1, 1, 1], polys: [3, 0, 0, 0] } },
    { segmentIndex: 2, data: { points: [2, 2, 2], polys: [3, 0, 0, 0] } },
  ]),
}));

jest.mock('../utilities/clipAndCacheSurfacesForViewport', () => ({
  clipAndCacheSurfacesForViewport: jest.fn(async () => new Map()),
}));

jest.mock(
  './utils/createAndAddContourSegmentationsFromClippedSurfaces',
  () => ({
    createAndAddContourSegmentationsFromClippedSurfaces: jest.fn(),
  })
);

describe('computeContourFromLabelmapSegmentation', () => {
  it('names each surface by its segmentation and its segment index, so two segmentations with the same segment index do not share a surface id', async () => {
    await computeContourFromLabelmapSegmentation('firstSegmentation', {
      viewport: { id: 'labelmapContours' },
    } as never);

    const clip = clipAndCacheSurfacesForViewport as jest.Mock;

    expect(
      clip.mock.calls[0][0].map(({ id, segmentIndex }) => [id, segmentIndex])
    ).toEqual([
      ['firstSegmentation-1', 1],
      ['firstSegmentation-2', 2],
    ]);
  });
});
