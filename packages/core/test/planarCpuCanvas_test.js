import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { getOrCreateCanvas } from '../src/RenderingEngine/helpers/getOrCreateCanvas';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
  drawPathOf,
} from './utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'namedCanvas';

/** The draw paths of a direct next planar viewport, and how each is shown. */
const PATHS = [
  ['a stack on the GPU', showStack, {}, 'frame-gpu'],
  ['a stack on the CPU', showStack, { renderBackend: 'cpu' }, 'frame-cpu'],
  ['a volume on the CPU', showVolume, { renderBackend: 'cpu' }, 'cpu-cpu'],
];

/** The canvases of an element that carry the class `cornerstone-canvas`. */
function namedCanvases(element) {
  return Array.from(element.querySelectorAll('canvas.cornerstone-canvas'));
}

describe('The canvas named cornerstone-canvas of a direct next planar viewport -- ', () => {
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
  });

  for (const [what, show, options, drawPath] of PATHS) {
    it(`is the one canvas that shows ${what}`, async function () {
      const series = await createSeries({ id: `namedCanvas-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, viewportId);

      await show(viewport, series, 2, options);

      expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);

      const named = namedCanvases(viewport.element);

      expect(named.length).toBe(1);
      expect(named[0]).toBe(viewport.getCanvas());
      expect(named[0].style.display).not.toBe('none');
      expect(getOrCreateCanvas(viewport.element)).toBe(viewport.canvas);
    });
  }

  it('is the canvas of the rendering engine again once the viewport of a CPU stack is disabled', async function () {
    const series = await createSeries({ id: 'namedCanvas-disabled' });
    const viewport = createNextViewport(renderingEngine, viewportId);
    const { element } = viewport;
    const engineCanvas = viewport.canvas;

    await showStack(viewport, series, 2, { renderBackend: 'cpu' });
    renderingEngine.disableElement(viewportId);

    expect(namedCanvases(element)).toEqual([engineCanvas]);
    expect(element.querySelectorAll('canvas').length).toBe(1);
    expect(getOrCreateCanvas(element)).toBe(engineCanvas);
  });
});
