import Representations from '../../../enums/SegmentationRepresentations';

// jest.mock factories are hoisted, so every variable they touch needs a `mock`
// prefix.
const mockComputeAndAddRepresentation = jest.fn(
  () =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ geometryIds: new Map([['geo-1', true]]) }), 10)
    )
);
const mockCanCompute = jest.fn(() => true);
const mockComputeSurfaceData = jest.fn();
const mockGetSegmentation = jest.fn(() => ({
  representationData: {}, // no Surface yet -> conversion is attempted
}));
const mockGetGeometry = jest.fn(() => ({ data: { segmentIndex: 1 } }));
const mockAddOrUpdateSurfaceToElement = jest.fn();

// surfaceDisplay.ts builds its logger at module scope, and the hoisted import
// runs before the consts above, so the logger is inlined here.
jest.mock('@cornerstonejs/core', () => ({
  cache: { getGeometry: (...a: unknown[]) => mockGetGeometry(...a) },
  getEnabledElementByViewportId: jest.fn(),
  utilities: {
    logger: {
      toolsLog: {
        getLogger: () => ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }),
      },
    },
  },
}));
jest.mock('./removeSurfaceFromElement', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('./addOrUpdateSurfaceToElement', () => ({
  __esModule: true,
  default: (...a: unknown[]) => mockAddOrUpdateSurfaceToElement(...a),
}));
jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: (...a: unknown[]) => mockGetSegmentation(...a),
}));
jest.mock('../../../stateManagement/segmentation/getColorLUT', () => ({
  getColorLUT: jest.fn(() => [null, [1, 2, 3, 255]]),
}));
jest.mock('../../../config', () => ({
  getPolySeg: () => ({
    canComputeRequestedRepresentation: (...a: unknown[]) =>
      mockCanCompute(...a),
    computeSurfaceData: (...a: unknown[]) => mockComputeSurfaceData(...a),
  }),
}));
jest.mock(
  '../../../utilities/segmentation/computeAndAddRepresentation',
  () => ({
    computeAndAddRepresentation: (...a: unknown[]) =>
      mockComputeAndAddRepresentation(...a),
  })
);
jest.mock(
  '../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices',
  () => ({ internalGetHiddenSegmentIndices: jest.fn(() => new Set()) })
);

// Imported after the mocks are registered.
import { render } from './surfaceDisplay';

const makeViewport = (id: string) => ({ id, render: jest.fn() });
const representation = {
  segmentationId: 'seg-1',
  type: Representations.Surface,
  colorLUTIndex: 0,
} as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('surfaceDisplay.render polySeg conversion guard', () => {
  it('launches the conversion only once while it is still in progress (concurrent renders)', async () => {
    const viewport = makeViewport('vp-1');

    await Promise.all([
      render(viewport as never, representation),
      render(viewport as never, representation),
    ]);

    expect(mockComputeAndAddRepresentation).toHaveBeenCalledTimes(1);
  });

  it('shares one conversion across viewports, and every viewport still renders the surface', async () => {
    const viewportA = makeViewport('vp-A');
    const viewportB = makeViewport('vp-B');

    await Promise.all([
      render(viewportA as never, representation),
      render(viewportB as never, representation),
    ]);

    expect(mockComputeAndAddRepresentation).toHaveBeenCalledTimes(1);

    // The viewport that does not start the conversion must await it, not skip
    // its own render: a guard that only blocks leaves that viewport empty.
    expect(mockAddOrUpdateSurfaceToElement).toHaveBeenCalledTimes(2);
    expect(viewportA.render).toHaveBeenCalledTimes(1);
    expect(viewportB.render).toHaveBeenCalledTimes(1);
  });

  it('is per-segmentation, not global: a different segmentation still converts', async () => {
    const other = { ...(representation as object), segmentationId: 'seg-2' };
    await Promise.all([
      render(makeViewport('vp-1') as never, representation),
      render(makeViewport('vp-1') as never, other as never),
    ]);

    expect(mockComputeAndAddRepresentation).toHaveBeenCalledTimes(2);
  });

  it('releases the guard after the conversion settles, so a later render can retry', async () => {
    const viewport = makeViewport('vp-2');

    await render(viewport as never, representation);
    await render(viewport as never, representation);

    expect(mockComputeAndAddRepresentation).toHaveBeenCalledTimes(2);
  });

  it('propagates a conversion failure to the caller', async () => {
    const boom = new Error('conversion failed');
    mockComputeAndAddRepresentation.mockImplementationOnce(
      () => Promise.reject(boom) as never
    );

    await expect(
      render(makeViewport('vp-3') as never, representation)
    ).rejects.toThrow('conversion failed');

    // The failed conversion must not stay in the map and block later renders.
    await render(makeViewport('vp-3') as never, representation);
    expect(mockComputeAndAddRepresentation).toHaveBeenCalledTimes(2);
  });
});
