import Representations from '../../../enums/SegmentationRepresentations';

// The render() path reaches into a wide dependency graph; stub everything that
// is not the guard so the test isolates the one behavior under test: how many
// times a polySeg surface conversion is launched under concurrent renders.
// jest.mock factories are hoisted, so every variable they touch must be
// prefixed with `mock`.
const mockComputeAndAddRepresentation = jest.fn(
  () =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ geometryIds: new Map() }), 10)
    )
);
const mockCanCompute = jest.fn(() => true);
const mockComputeSurfaceData = jest.fn();
const mockGetSegmentation = jest.fn(() => ({
  representationData: {}, // no Surface yet -> conversion is attempted
}));

jest.mock('@cornerstonejs/core', () => ({
  cache: { getGeometry: jest.fn() },
  getEnabledElementByViewportId: jest.fn(),
}));
jest.mock('./removeSurfaceFromElement', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('./addOrUpdateSurfaceToElement', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: (...a: unknown[]) => mockGetSegmentation(...a),
}));
jest.mock('../../../stateManagement/segmentation/getColorLUT', () => ({
  getColorLUT: jest.fn(() => []),
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
  mockComputeAndAddRepresentation.mockClear();
});

describe('surfaceDisplay.render polySeg conversion guard', () => {
  it('launches the conversion only once while it is still in progress (concurrent renders)', async () => {
    const viewport = makeViewport('vp-1');

    // Two renders fire before the first conversion resolves — exactly what the
    // stuck-toast bug does via repeated re-renders on a large segmentation.
    await Promise.all([
      render(viewport as never, representation),
      render(viewport as never, representation),
    ]);

    // Without the guard this is 2 (concurrent conversions -> memory churn ->
    // workers never reach progress:100 -> toast hangs). With it, it is 1.
    expect(mockComputeAndAddRepresentation).toHaveBeenCalledTimes(1);
  });

  it('deduplicates across viewports: two 3D viewports of the same segmentation convert once', async () => {
    // e.g. a 3D "four up" layout — several viewports render the same
    // segmentation at once. Keyed by segmentationId, only one conversion runs.
    await Promise.all([
      render(makeViewport('vp-A') as never, representation),
      render(makeViewport('vp-B') as never, representation),
    ]);

    expect(mockComputeAndAddRepresentation).toHaveBeenCalledTimes(1);
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
});
