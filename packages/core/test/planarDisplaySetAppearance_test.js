import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { Events, BlendModes, InterpolationType } = Enums;

const renderingEngineId = utilities.uuidv4();

const CASES = [
  ['a stack on the GPU', showStack, {}],
  ['a stack on the CPU', showStack, { renderBackend: 'cpu' }],
  ['a volume on the GPU', showVolume, {}],
  ['a volume on the CPU', showVolume, { renderBackend: 'cpu' }],
];

/**
 * One change of each key of the planar appearance, each with another value
 * than the one on display.
 */
const ONE_KEY_CHANGES = [
  { visible: false },
  { opacity: 0.5 },
  { voiRange: { lower: 10, upper: 90 } },
  { invert: true },
  { colormap: { name: 'hsv' } },
  { blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
  { slabThickness: 4 },
  { interpolationType: InterpolationType.NEAREST },
  { sharpening: 0.5 },
  { smoothing: 0.5 },
];

/** The DISPLAY_SET_APPEARANCE_CHANGED events of a viewport from now on. */
function recordAppearanceEvents(viewport) {
  const details = [];

  viewport.element.addEventListener(
    Events.DISPLAY_SET_APPEARANCE_CHANGED,
    (evt) => details.push(evt.detail)
  );

  return details;
}

/** The cause and the keys of each recorded event. */
function causesAndKeys(details) {
  return details.map(({ cause, changedKeys }) => [cause, changedKeys]);
}

describe('The appearance of a display set of a planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  for (const [where, show, options] of CASES) {
    it(`fires once at the mount with cause mount, the default window as an effective value and no override, of ${where}`, async function () {
      const series = await createSeries({ id: `appearanceMount-${where}` });
      const viewport = createNextViewport(renderingEngine, 'appearanceMount');
      const details = recordAppearanceEvents(viewport);

      await show(viewport, series, 0, options);

      const displaySetId = viewport.getSourceDisplaySetId();

      expect(details.length).toBe(1);
      expect(details[0].cause).toBe('mount');
      expect(details[0].displaySetId).toBe(displaySetId);
      expect(details[0].role).toBe('source');
      expect(details[0].overrides).toEqual({});
      expect(details[0].changedKeys).toEqual(Object.keys(details[0].effective));
      expect(details[0].effective.voiRange).toEqual(
        viewport.getDefaultVOIRange(displaySetId)
      );
      expect(details[0].effective.invert).toBe(false);
      expect(details[0].effective.visible).toBe(true);
      expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual({});
      expect(viewport.getEffectiveDisplaySetAppearance(displaySetId)).toEqual(
        details[0].effective
      );
    });

    it(`changes nothing and fires nothing when the overrides are set again, of ${where}`, async function () {
      const series = await createSeries({ id: `appearanceRoundTrip-${where}` });
      const viewport = createNextViewport(renderingEngine, 'appearanceTrip');

      await show(viewport, series, 0, options);

      const displaySetId = viewport.getSourceDisplaySetId();

      viewport.setDisplaySetAppearance(displaySetId, {
        voiRange: { lower: 10, upper: 90 },
        invert: true,
        colormap: { name: 'hsv' },
      });
      await renderAndWait(viewport);

      const before = viewport.getDisplaySetAppearance(displaySetId);
      const details = recordAppearanceEvents(viewport);

      viewport.setDisplaySetAppearance(
        displaySetId,
        viewport.getDisplaySetAppearance(displaySetId)
      );
      viewport.setDisplaySetAppearance(viewport.getDisplaySetAppearance());

      expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual(before);
      expect(details).toEqual([]);
    });

    it(`keeps an explicit window that equals the default window an override, of ${where}`, async function () {
      const series = await createSeries({ id: `appearanceDefault-${where}` });
      const viewport = createNextViewport(renderingEngine, 'appearanceSame');

      await show(viewport, series, 0, options);

      const displaySetId = viewport.getSourceDisplaySetId();
      const defaultRange = viewport.getDefaultVOIRange(displaySetId);
      const details = recordAppearanceEvents(viewport);

      viewport.setDisplaySetAppearance(displaySetId, {
        voiRange: { ...defaultRange },
      });

      expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual({
        voiRange: defaultRange,
      });
      expect(causesAndKeys(details)).toEqual([['edit', ['voiRange']]]);
    });

    it(`fires once with the key for a change of each key of the appearance, of ${where}`, async function () {
      const series = await createSeries({ id: `appearanceKeys-${where}` });
      const viewport = createNextViewport(renderingEngine, 'appearanceKeys');

      await show(viewport, series, 0, options);

      const displaySetId = viewport.getSourceDisplaySetId();
      const details = recordAppearanceEvents(viewport);

      for (const change of ONE_KEY_CHANGES) {
        viewport.setDisplaySetAppearance(displaySetId, change);
      }

      expect(causesAndKeys(details)).toEqual(
        ONE_KEY_CHANGES.map((change) => ['edit', Object.keys(change)])
      );
    });

    it(`resets only the keys given, back to their defaults, and fires once with cause reset, of ${where}`, async function () {
      const series = await createSeries({ id: `appearanceReset-${where}` });
      const viewport = createNextViewport(renderingEngine, 'appearanceReset');

      await show(viewport, series, 0, options);

      const displaySetId = viewport.getSourceDisplaySetId();
      const defaultRange = viewport.getDefaultVOIRange(displaySetId);

      viewport.setDisplaySetAppearance(displaySetId, {
        voiRange: { lower: 10, upper: 90 },
        invert: true,
      });

      const details = recordAppearanceEvents(viewport);

      viewport.resetDisplaySetAppearance(displaySetId, ['voiRange']);
      await renderAndWait(viewport);

      expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual({
        invert: true,
      });
      expect(
        viewport.getEffectiveDisplaySetAppearance(displaySetId).voiRange
      ).toEqual(defaultRange);
      expect(causesAndKeys(details)).toEqual([['reset', ['voiRange']]]);

      viewport.resetDisplaySetAppearance();

      expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual({});
      expect(
        viewport.getEffectiveDisplaySetAppearance(displaySetId).invert
      ).toBe(false);
      expect(causesAndKeys(details)).toEqual([
        ['reset', ['voiRange']],
        ['reset', ['invert']],
      ]);
    });
  }
});
