import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, utilities, getConfiguration } = cornerstone3D;
const { ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The five families of direct next viewports. */
const NEXT_FAMILIES = [
  ['planar', ViewportType.PLANAR_NEXT],
  ['3D', ViewportType.VOLUME_3D_NEXT],
  ['video', ViewportType.VIDEO_NEXT],
  ['whole slide', ViewportType.WHOLE_SLIDE_NEXT],
  ['ECG', ViewportType.ECG_NEXT],
];

/**
 * Enables one viewport of a type. With `useGenericViewport` set, a legacy
 * type gives its legacy adapter; without it, the legacy class.
 */
function enableViewport(renderingEngine, viewportType, useGenericViewport) {
  const rendering = getConfiguration().rendering;
  const before = rendering.useGenericViewport;
  const viewportId = `viewport-${viewportType}-${useGenericViewport}`;

  rendering.useGenericViewport = useGenericViewport;
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType,
    width: 200,
    height: 150,
    useEnableElement: true,
  });
  rendering.useGenericViewport = before;

  return renderingEngine.getViewport(viewportId);
}

/**
 * A stand-in for a vtk.js widget: it has what the viewport and the rendering
 * engine call, and records the actors that leave its renderer.
 */
function createWidget() {
  const actor = {};
  const removedActors = [];
  const widget = {
    enabled: true,
    removedActors,
    getEnabled: () => widget.enabled,
    setEnabled: (enabled) => {
      widget.enabled = enabled;
    },
    getActor: () => actor,
    getRenderer: () => ({
      setDraw: () => {},
      removeActor: (removed) => removedActors.push(removed),
    }),
  };

  return widget;
}

describe('Legacy members that are not on the direct next viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  NEXT_FAMILIES.forEach(([family, viewportType]) => {
    it(`says isDestroyed on a direct next ${family} viewport once the engine disables it, and has no isDisabled`, function () {
      const viewport = enableViewport(renderingEngine, viewportType, true);

      expect(viewport.type).toBe(viewportType);
      expect(viewport.isDestroyed).toBe(false);
      expect('isDisabled' in viewport).toBe(false);

      renderingEngine.disableElement(viewport.id);

      expect(viewport.isDestroyed).toBe(true);
      expect('isDisabled' in viewport).toBe(false);
    });
  });

  NEXT_FAMILIES.forEach(([family, viewportType]) => {
    it(`has no isOrientationChangeable on a direct next ${family} viewport`, function () {
      const viewport = enableViewport(renderingEngine, viewportType, true);

      expect(viewport.isOrientationChangeable).toBeUndefined();
    });
  });

  it('keeps isOrientationChangeable on the 3D, video, whole slide and ECG adapters, with the answer of the legacy viewports', function () {
    for (const viewportType of [
      ViewportType.VOLUME_3D,
      ViewportType.VIDEO,
      ViewportType.WHOLE_SLIDE,
      ViewportType.ECG,
    ]) {
      const legacy = enableViewport(renderingEngine, viewportType, false);
      const adapter = enableViewport(renderingEngine, viewportType, true);

      expect(utilities.isGenericViewport(legacy)).toBe(false);
      expect(utilities.isGenericViewport(adapter)).toBe(true);
      expect(adapter.isOrientationChangeable()).toBe(
        legacy.isOrientationChangeable()
      );
    }
  });

  it('cannot be set from outside', function () {
    const viewport = enableViewport(
      renderingEngine,
      ViewportType.PLANAR_NEXT,
      true
    );

    expect(() => {
      viewport.isDestroyed = true;
    }).toThrow();
    expect(viewport.isDestroyed).toBe(false);
  });

  it('keeps isDisabled on a legacy viewport and on a legacy adapter', function () {
    const legacy = enableViewport(renderingEngine, ViewportType.STACK, false);
    const adapter = enableViewport(renderingEngine, ViewportType.STACK, true);

    expect(utilities.isGenericViewport(legacy)).toBe(false);
    expect(utilities.isGenericViewport(adapter)).toBe(true);
    expect(legacy.isDisabled).toBe(false);
    expect(adapter.isDisabled).toBe(false);

    renderingEngine.disableElement(legacy.id);
    renderingEngine.disableElement(adapter.id);

    expect(legacy.isDisabled).toBe(true);
    expect(adapter.isDisabled).toBe(true);
    expect(adapter.isDestroyed).toBe(true);
  });

  NEXT_FAMILIES.filter(
    ([, viewportType]) => viewportType !== ViewportType.VOLUME_3D_NEXT
  ).forEach(([family, viewportType]) => {
    it(`keeps no widgets on a direct next ${family} viewport, which the engine disables without them`, function () {
      const viewport = enableViewport(renderingEngine, viewportType, true);

      expect(viewport.addWidget).toBeUndefined();
      expect(viewport.getWidget).toBeUndefined();
      expect(viewport.getWidgets).toBeUndefined();
      expect(() => viewport.removeWidgets()).not.toThrow();
      expect(() => renderingEngine.disableElement(viewport.id)).not.toThrow();
      expect(renderingEngine.getViewport(viewport.id)).toBeUndefined();
    });
  });

  it('keeps the widgets of a direct next 3D viewport, without getWidget, and turns them off when the engine disables it', function () {
    const viewport = enableViewport(
      renderingEngine,
      ViewportType.VOLUME_3D_NEXT,
      true
    );
    const widget = createWidget();

    viewport.addWidget('marker', widget);

    expect(viewport.getWidget).toBeUndefined();
    expect(viewport.getWidgets()).toEqual([widget]);

    renderingEngine.disableElement(viewport.id);

    expect(widget.enabled).toBe(false);
    expect(widget.removedActors).toEqual([widget.getActor()]);
  });

  it('keeps getWidget on the 3D legacy adapter, as on the legacy 3D viewport', function () {
    const legacy = enableViewport(
      renderingEngine,
      ViewportType.VOLUME_3D,
      false
    );
    const adapter = enableViewport(
      renderingEngine,
      ViewportType.VOLUME_3D,
      true
    );

    for (const viewport of [legacy, adapter]) {
      const widget = createWidget();

      viewport.addWidget('marker', widget);

      expect(viewport.getWidget('marker')).toBe(widget);
      expect(viewport.getWidget('other')).toBeUndefined();
      expect(viewport.getWidgets()).toEqual([widget]);
    }

    expect(utilities.isGenericViewport(legacy)).toBe(false);
    expect(utilities.isGenericViewport(adapter)).toBe(true);
  });
});
