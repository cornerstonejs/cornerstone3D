import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;
const { WindowLevelTool } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'windowLevelVolumeMultiplierNext';

/**
 * The range of the values of each image of the test series, and of its
 * middle slice: 1 + (i + 3 j + 7 k) over 32 columns and 24 rows spans 100.
 * The whole volume of 8 slices spans 149.
 */
const IMAGE_RANGE = 100;

/** The drag across the canvas, in pixels. */
const DRAG = [100, 0];

const CASES = [
  ['in stack mode on the GPU', showStack, {}],
  ['in stack mode on the CPU', showStack, { renderBackend: 'cpu' }],
  ['in volume mode on the GPU', showVolume, {}],
  ['in volume mode on the CPU', showVolume, { renderBackend: 'cpu' }],
];

/** The window of the source of a viewport: the one set, else the default. */
function windowOf(viewport) {
  const displaySetId = viewport.getSourceDisplaySetId();
  const voiRange =
    viewport.getDisplaySetPresentation(displaySetId)?.voiRange ??
    viewport.getDefaultVOIRange(displaySetId);

  return utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper);
}

/**
 * The window level tool on a planar viewport. On 5.x the tool gave the
 * volume of a legacy volume viewport to `_getMultiplierFromDynamicRange`,
 * which took the range of the middle slice of the volume, and a stack gave
 * the range of the image on display; one drag of the same series changed the
 * window as much on a stack as on a volume. OHIF's upgrade saw twice the
 * change on the MPR of a CT on 6.0 (its M38).
 */
describe('The window level tool on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [WindowLevelTool],
      toolActivations: {
        [WindowLevelTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
    });

    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups[toolGroupId];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  CASES.forEach(([name, show, options]) => {
    it(`changes the window by the range of one slice of the series per 1024 pixels ${name}, as 5.x`, async function () {
      const series = await createSeries({ id: `windowLevelMultiplier` });
      const viewport = createNextViewport(
        renderingEngine,
        'windowLevelMultiplier'
      );

      toolGroup.addViewport(viewport.id, renderingEngine.id);
      await show(viewport, series, 6, options);

      const before = windowOf(viewport);
      const tool = toolGroup.getToolInstance(WindowLevelTool.toolName);

      tool.mouseDragCallback({
        detail: {
          element: viewport.element,
          deltaPoints: { canvas: DRAG },
        },
      });

      const after = windowOf(viewport);

      expect(after.windowWidth - before.windowWidth).toBeCloseTo(
        (DRAG[0] * IMAGE_RANGE) / 1024,
        3
      );
      expect(after.windowCenter).toBeCloseTo(before.windowCenter, 3);
    });
  });
});
