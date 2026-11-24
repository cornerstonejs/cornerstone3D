import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  expectPointsClose,
  showStack,
  showVolume,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();

/** The slice that each test shows. */
const SLICE_INDEX = 2;

/** A voxel of the slice on display, away from its edges. */
const VOXEL = [3, 5, SLICE_INDEX];

/**
 * The two ways a series shows on a direct next planar viewport, with the
 * render mode of the CPU, and the index of the voxel that the image data
 * gives: a stack gives the image on display, a volume the volume.
 */
const MODES = [
  {
    mode: 'stack',
    show: showStack,
    cpuRenderMode: 'cpuImage',
    index: [VOXEL[0], VOXEL[1], 0],
  },
  {
    mode: 'volume',
    show: showVolume,
    cpuRenderMode: 'cpuVolume',
    index: VOXEL,
  },
];

describe('getDefaultImageData of a direct next planar viewport on the CPU -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  for (const { mode, show, cpuRenderMode, index } of MODES) {
    it(`gives image data whose worldToIndex finds a voxel as on the GPU in ${mode} mode`, async function () {
      const series = await createSeries({ id: `defaultImageDataCpu-${mode}` });
      const indices = {};

      for (const backend of ['gpu', 'cpu']) {
        const viewport = createNextViewport(
          renderingEngine,
          `defaultImageData-${backend}`
        );

        await show(viewport, series, SLICE_INDEX, { renderBackend: backend });

        expect(viewport.getCurrentMode()).toBe(mode);
        expect(viewport.getRenderPlan()[0].renderMode === cpuRenderMode).toBe(
          backend === 'cpu'
        );

        const imageData = viewport.getDefaultImageData();

        expect(imageData).toBeDefined();
        indices[backend] = Array.from(
          imageData.worldToIndex(worldOfVoxel(series, VOXEL))
        );
      }

      expectPointsClose(indices.gpu, index);
      expectPointsClose(indices.cpu, indices.gpu);
    });
  }
});
