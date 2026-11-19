import contourDisplay from './contourDisplay';
import { getPolySeg } from '../../../config';

const geometries = {
  contourGeometry: {
    data: {
      contours: [
        {
          points: [
            [0, 0, 20],
            [0, 0, 10],
            [0, 0, 0],
          ],
        },
      ],
    },
  },
  'firstSegmentation-surface-1': {
    data: { points: [1, 1, 1], polys: [3, 0, 0, 0], segmentIndex: 1 },
  },
  'firstSegmentation-surface-2': {
    data: { points: [2, 2, 2], polys: [3, 0, 0, 0], segmentIndex: 2 },
  },
};

jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getGeometry: (geometryId) => geometries[geometryId],
  },
  getEnabledElementByViewportId: jest.fn(),
  Enums: { ViewportStatus: { RENDERED: 'rendered' } },
  utilities: {
    getRandomSampleFromArray: (array) => array,
    logger: {
      toolsLog: { getLogger: () => ({ debug: jest.fn(), warn: jest.fn() }) },
    },
  },
}));

jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: () => ({
    representationData: {
      Contour: {
        geometryIds: ['contourGeometry'],
        annotationUIDsMap: new Map(),
      },
    },
  }),
}));

jest.mock('../../../config', () => {
  const polySeg = {
    canComputeRequestedRepresentation: jest.fn(() => true),
    computeContourData: jest.fn(),
    computeSurfaceData: jest.fn(async () => ({
      geometryIds: new Map([
        [1, 'firstSegmentation-surface-1'],
        [2, 'firstSegmentation-surface-2'],
      ]),
    })),
    clipAndCacheSurfacesForViewport: jest.fn(async () => new Map()),
    extractContourData: jest.fn(() => new Map()),
    createAndAddContourSegmentationsFromClippedSurfaces: jest.fn(
      () => new Map()
    ),
  };

  return { getPolySeg: () => polySeg };
});

jest.mock('./contourHandler/handleContourSegmentation', () => ({
  handleContourSegmentation: jest.fn(),
}));

jest.mock('./removeContourFromElement', () => jest.fn());

jest.mock('../../../utilities/getViewportICamera', () =>
  jest.fn(() => ({ viewPlaneNormal: [0, 0, 1] }))
);

jest.mock(
  '../../../utilities/segmentation/computeAndAddRepresentation',
  () => ({
    computeAndAddRepresentation: jest.fn(),
  })
);

jest.mock('../../../utilities/segmentation/getUniqueSegmentIndices', () => ({
  getUniqueSegmentIndices: jest.fn(() => [1, 2]),
}));

jest.mock('../../../stateManagement/annotation/annotationState', () => ({
  getAnnotation: jest.fn(),
}));

describe('contourDisplay', () => {
  it('names each surface by its geometry id when it cuts the surfaces of a segmentation for a viewport of another orientation', async () => {
    const viewport = {
      id: 'contourDisplayViewport',
      viewportStatus: 'rendered',
    };

    await contourDisplay.render(
      viewport as never,
      {
        segmentationId: 'firstSegmentation',
      } as never
    );

    const clip = getPolySeg().clipAndCacheSurfacesForViewport as jest.Mock;

    expect(clip).toHaveBeenCalledTimes(1);
    expect(
      clip.mock.calls[0][0].map(({ id, segmentIndex }) => [id, segmentIndex])
    ).toEqual([
      ['firstSegmentation-surface-1', 1],
      ['firstSegmentation-surface-2', 2],
    ]);
  });
});
