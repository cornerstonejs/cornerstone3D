import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { startListenerCounts } from '../../../utils/test/listenerCounts';

const { utilities, Enums, volumeLoader, cache, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const {
  CrosshairsTool,
  TrackballRotateTool,
  VolumeCroppingTool,
  OrientationControllerTool,
  OrientationMarkerTool,
  WindowLevelTool,
  PanTool,
  ToolGroupManager,
} = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'destroyListeners';
const ROUNDS = 5;

/**
 * Longer than the delays after which a tool adds what it shows (the marker
 * of the orientation controller comes 500 ms after the tool is enabled).
 */
const TOOL_DELAY_MS = 700;

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Resolves after a number of milliseconds. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Makes and caches a small volume and registers it as a display set. */
async function registerVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'destroyListeners',
    id: 'destroyListeners',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  cornerstone3D.displaySetRegistry.add('destroyListenersVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return volumeId;
}

/**
 * Makes the viewports of a scene and shows the volume on each: `'mpr'` three
 * planar viewports in volume mode, `'3d'` one 3D viewport.
 */
async function showScene(renderingEngine, scene) {
  const volumeId = await registerVolume();
  const specs =
    scene === 'mpr'
      ? [
          ['destroyAxial', ViewportType.PLANAR, OrientationAxis.AXIAL],
          ['destroySagittal', ViewportType.PLANAR, OrientationAxis.SAGITTAL],
          ['destroyCoronal', ViewportType.PLANAR, OrientationAxis.CORONAL],
        ]
      : [['destroy3D', ViewportType.VOLUME_3D, OrientationAxis.CORONAL]];

  testUtils.createViewports(
    renderingEngine,
    specs.map(([viewportId, viewportType, orientation]) => ({
      viewportId,
      viewportType,
      orientation,
      width: 300,
      height: 300,
      useEnableElement: true,
    }))
  );

  const viewports = specs.map(([viewportId]) =>
    renderingEngine.getViewport(viewportId)
  );

  for (const viewport of viewports) {
    await viewport.setDisplaySets({
      displaySetId: 'destroyListenersVolume',
      options:
        viewport.type === ViewportType.PLANAR ? { mode: 'volume' } : undefined,
    });
  }

  renderingEngine.render();
  await frames();

  return { viewports, volumeId };
}

/** The sum of the counts of several elements, by event type. */
function sumOfElements(counts, elements) {
  const sum = {};

  elements.forEach((element) => {
    Object.entries(counts.onElement(element)).forEach(([type, count]) => {
      sum[type] = (sum[type] ?? 0) + count;
    });
  });

  return sum;
}

/** The counts that grew from `before` to `after`, as `{ type: [before, after] }`. */
function growth(before, after) {
  return Object.fromEntries(
    Object.keys({ ...before, ...after })
      .filter((type) => (after[type] ?? 0) !== (before[type] ?? 0))
      .map((type) => [type, [before[type] ?? 0, after[type] ?? 0]])
  );
}

/**
 * The tool of each case of row 190 of v6-open-issues.md, and what makes it
 * work: the scene it needs, its configuration, and the mode it is set to
 * (twice in each round, as an application that sets the mode of a tool
 * again). A round destroys the tool group once what the tool shows is there
 * (even rounds) or at once (odd rounds), and counts after the delays of the
 * tools.
 */
const CASES = [
  {
    name: 'a tool group with WindowLevelTool and PanTool',
    tools: [WindowLevelTool, PanTool],
    scene: 'mpr',
    setUp: (toolGroup) =>
      toolGroup.setToolActive(WindowLevelTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      }),
  },
  {
    name: 'CrosshairsTool',
    tools: [CrosshairsTool],
    scene: 'mpr',
    configuration: ({ volumeId }) => ({ volumeId }),
    setUp: (toolGroup) =>
      toolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      }),
  },
  {
    name: 'TrackballRotateTool',
    tools: [TrackballRotateTool],
    scene: '3d',
    setUp: (toolGroup) =>
      toolGroup.setToolActive(TrackballRotateTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      }),
  },
  {
    name: 'VolumeCroppingTool',
    tools: [VolumeCroppingTool],
    scene: '3d',
    setUp: (toolGroup) =>
      toolGroup.setToolActive(VolumeCroppingTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      }),
  },
  {
    name: 'OrientationControllerTool',
    tools: [OrientationControllerTool],
    scene: 'mpr',
    setUp: (toolGroup) =>
      toolGroup.setToolEnabled(OrientationControllerTool.toolName),
  },
  {
    name: 'OrientationMarkerTool',
    tools: [OrientationMarkerTool],
    scene: '3d',
    setUp: (toolGroup) =>
      toolGroup.setToolEnabled(OrientationMarkerTool.toolName),
  },
];

describe('The listeners of a tool group that is made, used and destroyed five times -- ', () => {
  let renderingEngine;
  let counts;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
      tools: CASES.flatMap(({ tools }) => tools),
    }).renderingEngine;
    counts = startListenerCounts(eventTarget);
  });

  afterEach(function () {
    counts.stop();
    ToolGroupManager.destroyToolGroup(toolGroupId);
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  for (const { name, tools, scene, configuration, setUp } of CASES) {
    it(`${name}: leaves no listener on eventTarget or on the elements`, async function () {
      const { viewports, volumeId } = await showScene(renderingEngine, scene);
      const elements = viewports.map(({ element }) => element);
      const rounds = [];
      const eventTargetBefore = counts.onEventTarget();
      const elementsBefore = sumOfElements(counts, elements);

      for (let round = 0; round < ROUNDS; round++) {
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

        tools.forEach((tool) =>
          toolGroup.addTool(tool.toolName, configuration?.({ volumeId }))
        );
        viewports.forEach(({ id }) =>
          toolGroup.addViewport(id, renderingEngineId)
        );
        setUp(toolGroup);
        setUp(toolGroup);
        renderingEngine.render();
        await frames();

        if (round % 2 === 0) {
          await wait(TOOL_DELAY_MS);
        }

        ToolGroupManager.destroyToolGroup(toolGroupId);
        await wait(TOOL_DELAY_MS);
        await frames();
        rounds.push({
          eventTarget: growth(eventTargetBefore, counts.onEventTarget()),
          elements: growth(elementsBefore, sumOfElements(counts, elements)),
        });
      }

      console.log(`FX4LEAK ${JSON.stringify({ name, rounds })}`);

      expect(rounds.at(-1)).toEqual({ eventTarget: {}, elements: {} });
    }, 60000);
  }
});
