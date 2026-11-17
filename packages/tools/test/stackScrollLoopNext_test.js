import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;
const { StackScrollTool, Enums: csToolsEnums } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'stackScrollLoopNext';

/**
 * Turns the mouse wheel over the middle of the viewport by one notch, to the
 * next slice with a direction of 1 and to the one before with -1. The legacy
 * wheel deltas are given as a real wheel gives them, against `deltaY`.
 */
function turnWheel(viewport, direction) {
  const { left, top, width, height } = viewport.element.getBoundingClientRect();

  viewport.element.dispatchEvent(
    new WheelEvent('wheel', {
      target: viewport.element,
      clientX: left + width / 2,
      clientY: top + height / 2,
      pageX: left + width / 2,
      pageY: top + height / 2,
      deltaX: 0,
      deltaY: 12 * direction,
      deltaMode: 0,
      wheelDelta: -36 * direction,
      wheelDeltaX: 0,
      wheelDeltaY: -36 * direction,
    })
  );
}

describe('StackScrollTool on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [StackScrollTool],
      toolActivations: {
        [StackScrollTool.toolName]: {
          bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
        },
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
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  const modes = [
    { mode: 'stack', show: showStack },
    { mode: 'volume', show: showVolume },
  ];

  modes.forEach(({ mode, show }) => {
    it(`stops at both ends in ${mode} mode, and wraps at both ends with the loop configuration`, async function () {
      const series = await createSeries({ id: `scrollLoop${mode}` });
      const viewport = createNextViewport(renderingEngine, 'next');
      const last = series.size.slices - 1;
      const indices = {};
      const turn = (direction) => {
        turnWheel(viewport, direction);

        return viewport.getCurrentImageIdIndex();
      };

      toolGroup.addViewport(viewport.id, renderingEngineId);
      await show(viewport, series, 0);
      await utilities.jumpToSlice(viewport.element, { imageIndex: 0 });

      indices.stop = [turn(-1), turn(1), turn(1)];

      toolGroup.setToolConfiguration(StackScrollTool.toolName, { loop: true });
      await utilities.jumpToSlice(viewport.element, { imageIndex: 0 });

      indices.loop = [turn(-1), turn(1), turn(1), turn(-1), turn(-1)];
      await renderAndWait(viewport);

      expect(viewport.getCurrentMode()).toBe(mode);
      expect(indices.stop).toEqual([0, 1, 2]);
      expect(indices.loop).toEqual([last, 0, 1, 0, last]);
    });
  });
});
