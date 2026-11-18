import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, metaData } = cornerstone3D;
const { ViewportType } = Enums;
const { ZoomTool, ToolGroupManager, Enums: csToolsEnums } = csTools3d;
const { MouseBindings, Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'zoomEcgNext';
const viewportId = 'zoomEcgNext';
const imageId = 'ecg://test/zoomEcgNext';
const HEIGHT = 300;
const MOUSE = [130, 90];

/** Two animation frames, for a render that a tool asked for. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Registers the metadata of an ECG of two channels of 1000 samples at 500
 * samples in a second, a sine in each.
 */
function addEcgMetadata() {
  const channels = [0, 1].map(() =>
    Int16Array.from({ length: 1000 }, (_, sample) =>
      Math.round(1000 * Math.sin((sample / 100) * Math.PI * 2))
    )
  );

  metaData.addProvider((type, queriedImageId) => {
    if (type !== Enums.MetadataModules.ECG || queriedImageId !== imageId) {
      return;
    }

    return {
      numberOfWaveformChannels: 2,
      numberOfWaveformSamples: 1000,
      samplingFrequency: 500,
      waveformBitsAllocated: 16,
      waveformSampleInterpretation: 'SS',
      multiplexGroupLabel: 'ECG',
      channelDefinitionSequence: [
        { channelSourceSequence: { codeMeaning: 'Channel 1' } },
        { channelSourceSequence: { codeMeaning: 'Channel 2' } },
      ],
      waveformData: { retrieveBulkData: () => Promise.resolve(channels) },
    };
  }, 100);
}

/** The mouse event of a type at a canvas point of the element. */
function mouseEventAt(element, type, canvasPoint) {
  const rect = element.getBoundingClientRect();
  const clientX = Math.round(rect.left + canvasPoint[0]);
  const clientY = Math.round(rect.top + canvasPoint[1]);

  return new MouseEvent(type, {
    clientX,
    clientY,
    pageX: clientX + window.pageXOffset,
    pageY: clientY + window.pageYOffset,
    buttons: 1,
    bubbles: true,
  });
}

/**
 * Makes a direct next ECG viewport of 400 by 300 pixels that shows the ECG,
 * with the zoom tool on the wheel and on the first mouse button.
 */
async function showEcgWithZoomTool(renderingEngine) {
  addEcgMetadata();

  const element = testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.ECG_NEXT,
    width: 400,
    height: HEIGHT,
    useEnableElement: true,
  });
  const viewport = renderingEngine.getViewport(viewportId);
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  toolGroup.addViewport(viewportId, renderingEngineId);
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Wheel },
      { mouseButton: MouseBindings.Primary },
    ],
  });
  await viewport.setDisplaySets({ displaySetId: imageId });
  viewport.render();
  await frames();

  return { viewport, element };
}

/** Checks that a world point is drawn at a canvas point, to 0.01 pixel. */
function expectWorldPointAt(viewport, worldPoint, canvasPoint) {
  const drawnAt = viewport.worldToCanvas(worldPoint);

  expect(drawnAt[0]).toBeCloseTo(canvasPoint[0], 2);
  expect(drawnAt[1]).toBeCloseTo(canvasPoint[1], 2);
}

describe('ZoomTool on a direct next ECG viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [ZoomTool],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('zooms by the step of the tool at each of two wheel steps, and the point under the mouse stays there', async function () {
    const { viewport, element } = await showEcgWithZoomTool(renderingEngine);
    const underMouse = viewport.canvasToWorld(MOUSE);
    const rect = element.getBoundingClientRect();
    const step = 1 / (1 - (5 * 5) / HEIGHT);

    expect(viewport.getZoom()).toBeCloseTo(1, 6);

    for (let wheelStep = 1; wheelStep <= 2; wheelStep++) {
      element.dispatchEvent(
        new WheelEvent('wheel', {
          clientX: Math.round(rect.left + MOUSE[0]),
          clientY: Math.round(rect.top + MOUSE[1]),
          deltaY: 100,
          bubbles: true,
          cancelable: true,
        })
      );
      await frames();

      expect(viewport.getZoom()).toBeCloseTo(step ** wheelStep, 6);
      expectWorldPointAt(viewport, underMouse, MOUSE);
    }
  });

  it('zooms out by a drag up of 40 pixels in two moves, and the point where the drag started stays there', async function () {
    const { viewport, element } = await showEcgWithZoomTool(renderingEngine);
    const underMouse = viewport.canvasToWorld(MOUSE);
    const pressed = new Promise((resolve) => {
      element.addEventListener(csToolsEvents.MOUSE_DOWN, resolve, {
        once: true,
      });
    });

    element.dispatchEvent(mouseEventAt(element, 'mousedown', MOUSE));
    await pressed;
    document.dispatchEvent(
      mouseEventAt(element, 'mousemove', [MOUSE[0], MOUSE[1] - 20])
    );
    document.dispatchEvent(
      mouseEventAt(element, 'mousemove', [MOUSE[0], MOUSE[1] - 40])
    );
    document.dispatchEvent(
      mouseEventAt(element, 'mouseup', [MOUSE[0], MOUSE[1] - 40])
    );
    await frames();

    expect(viewport.getZoom()).toBeCloseTo(1 / (1 + (20 * 5) / HEIGHT) ** 2, 6);
    expectWorldPointAt(viewport, underMouse, MOUSE);
  });
});
