import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createSeries,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const DISPLAY_AREA = { imageArea: [0.5, 0.5] };

/**
 * Makes a direct next planar viewport of 400 by 300 pixels with a display
 * area in its options.
 */
function createNextViewportWithDisplayAreaOption(
  renderingEngine,
  viewportId,
  displayArea = DISPLAY_AREA
) {
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
      displayArea,
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
    it(`is the display area of the view state and of the framing from the start, in ${mode} mode`, async function () {
      const next = createNextViewportWithDisplayAreaOption(
        renderingEngine,
        'nextDisplayAreaOption'
      );

      await show(next, series, 2);

      const framing = next.getViewFraming();

      expect(next.getCurrentMode()).toBe(mode);
      expect(next.getViewState().displayArea).toEqual(DISPLAY_AREA);
      expect(framing.displayArea).toEqual(DISPLAY_AREA);
      expect(next.defaultOptions.displayArea).toEqual(DISPLAY_AREA);
      expect(framing.zoom).toBeCloseTo(2, 6);
      expect(framing.fitScale).toEqual([1, 1]);
    }, 15000);

    it(`answers with the display area that the view state is given later, in ${mode} mode`, async function () {
      const next = createNextViewportWithDisplayAreaOption(
        renderingEngine,
        'nextDisplayAreaState'
      );
      const displayArea = { imageArea: [0.25, 0.25] };

      await show(next, series, 2);
      next.setViewState({ displayArea });

      expect(next.getViewState().displayArea).toEqual(displayArea);
      expect(next.getViewFraming().zoom).toBeCloseTo(4, 6);
    }, 15000);

    it(`shows the fit after resetViewState, as the option has no storeAsInitialCamera, in ${mode} mode`, async function () {
      const next = createNextViewportWithDisplayAreaOption(
        renderingEngine,
        'nextDisplayAreaCleared'
      );

      await show(next, series, 2);
      next.setViewState({ displayArea: { imageArea: [0.25, 0.25] } });
      next.setViewFraming({ pan: [10, 0] });
      next.resetViewState();

      const framing = next.getViewFraming();

      expect(next.getViewState().displayArea).toBeUndefined();
      expect(framing.displayArea).toBeUndefined();
      expect(framing.zoom).toBeCloseTo(1, 6);
      expect(framing.pan[0]).toBeCloseTo(0, 6);
      expect(framing.pan[1]).toBeCloseTo(0, 6);
    }, 15000);

    it(`goes back to the display area of the option with storeAsInitialCamera after resetViewState, in ${mode} mode`, async function () {
      const stored = { ...DISPLAY_AREA, storeAsInitialCamera: true };
      const next = createNextViewportWithDisplayAreaOption(
        renderingEngine,
        'nextDisplayAreaStored',
        stored
      );

      await show(next, series, 2);
      next.setViewFraming({ zoom: 3, pan: [10, 0] });

      expect(next.getViewState().displayArea).toBeUndefined();

      next.resetViewState();

      const framing = next.getViewFraming();

      expect(next.getViewState().displayArea).toEqual(stored);
      expect(framing.zoom).toBeCloseTo(2, 6);
      expect(framing.pan[0]).toBeCloseTo(0, 6);
      expect(framing.pan[1]).toBeCloseTo(0, 6);
    }, 15000);
  }
});
