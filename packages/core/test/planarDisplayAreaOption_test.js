import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createSeries,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, viewportProjection } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const DISPLAY_AREA = { imageArea: [0.5, 0.5] };

/**
 * Makes a direct next planar viewport of 400 by 300 pixels with a display
 * area in its options.
 */
function createNextViewportWithDisplayAreaOption(renderingEngine, viewportId) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      background: [1, 0, 1],
      orientation: OrientationAxis.ACQUISITION,
      displayArea: DISPLAY_AREA,
    },
  });

  return renderingEngine.getViewport(viewportId);
}

describe('The display area option of a direct next planar viewport -- ', () => {
  let renderingEngine;
  let series;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries();
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const [mode, show] of [
    ['stack', showStack],
    ['volume', showVolume],
  ]) {
    it(`is what getDisplayArea answers while the view state has none and the picture is the fit, as in 5.x, in ${mode} mode`, async function () {
      const next = createNextViewportWithDisplayAreaOption(
        renderingEngine,
        'nextDisplayAreaOption'
      );

      await show(next, series, 2);

      const presentation = viewportProjection.getPresentation(next);

      expect(next.getCurrentMode()).toBe(mode);
      expect(next.getViewState().displayArea).toBeUndefined();
      expect(next.getDisplayArea()).toEqual(DISPLAY_AREA);
      expect(presentation.displayArea).toEqual(DISPLAY_AREA);
      expect(presentation.zoom).toBeCloseTo(1, 6);
      expect(presentation.pan[0]).toBeCloseTo(0, 6);
      expect(presentation.pan[1]).toBeCloseTo(0, 6);
    }, 15000);

    it(`answers with the display area of the view state once it has one, in ${mode} mode`, async function () {
      const next = createNextViewportWithDisplayAreaOption(
        renderingEngine,
        'nextDisplayAreaState'
      );
      const displayArea = { imageArea: [0.25, 0.25] };

      await show(next, series, 2);
      next.setViewState({ displayArea });

      expect(next.getViewState().displayArea).toEqual(displayArea);
      expect(next.getDisplayArea()).toEqual(displayArea);
      expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(4, 6);
    }, 15000);
  }
});
