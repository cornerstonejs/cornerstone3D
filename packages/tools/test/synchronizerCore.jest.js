jest.mock('@cornerstonejs/core', () => {
  return {
    Enums: {
      Events: {
        ELEMENT_DISABLED: 'CORNERSTONE_ELEMENT_DISABLED',
      },
      ViewportType: {
        PLANAR: 'planar',
      },
    },
    eventTarget: new EventTarget(),
    getRenderingEngine: jest.fn(),
    getRenderingEngines: jest.fn(),
    getEnabledElement: jest.fn(),
    getEnabledElementByViewportId: jest.fn(),
    utilities: {
      logger: {
        toolsLog: {
          getLogger: jest.fn(() => ({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            setLevel: jest.fn(),
          })),
        },
      },
      clonePoint3: jest.fn((point) => (point ? [...point] : undefined)),
      isEqual: jest.fn((v1, v2) =>
        v1.every((value, index) => Math.abs(value - v2[index]) < 1e-5)
      ),
      isOpposite: jest.fn((v1, v2) =>
        v1.every((value, index) => Math.abs(value + v2[index]) < 1e-5)
      ),
      getViewportContentMode: jest.fn((viewport) =>
        viewport?.getCurrentMode?.()
      ),
      viewportIsInVolumeMode: jest.fn((viewport) =>
        ['volume', 'volume3d'].includes(viewport?.getCurrentMode?.())
      ),
      viewportSupportsDisplaySetPresentation: jest.fn(
        (viewport) =>
          typeof viewport?.getSourceDataId === 'function' &&
          typeof viewport?.getDefaultVOIRange === 'function'
      ),
    },
    viewportProjection: {
      getPresentation: jest.fn(() => undefined),
      withPresentation: jest.fn(() => undefined),
    },
  };
});

import {
  getRenderingEngine,
  getRenderingEngines,
  getEnabledElement,
  getEnabledElementByViewportId,
  eventTarget,
  viewportProjection,
} from '@cornerstonejs/core';

import Synchronizer from '../src/store/SynchronizerManager/Synchronizer';
import {
  createSynchronizer,
  getSynchronizer,
  getAllSynchronizers,
  getSynchronizersForViewport,
  destroySynchronizer,
  destroy as destroyAllSynchronizers,
} from '../src/store/SynchronizerManager';
import { state } from '../src/store/state';

import cameraSyncCallback from '../src/synchronizers/callbacks/cameraSyncCallback';
import voiSyncCallback from '../src/synchronizers/callbacks/voiSyncCallback';
import slabThicknessSyncCallback from '../src/synchronizers/callbacks/slabThicknessSyncCallback';
import presentationViewSyncCallback from '../src/synchronizers/callbacks/presentationViewSyncCallback';
import areViewportsCoplanar from '../src/synchronizers/callbacks/areViewportsCoplanar';

/**
 * Builds a tiny fake "cornerstone world": a map of renderingEngineId ->
 * fake rendering engine (with a real DOM element per viewport), wired up to
 * the mocked getRenderingEngine/getEnabledElement so that Synchronizer's
 * source-viewport lookups and real DOM event dispatch both work end to end.
 */
function createWorld() {
  const engines = new Map();
  const elementToViewportInfo = new Map();

  function addViewport(renderingEngineId, viewportId) {
    const element = document.createElement('div');

    let engine = engines.get(renderingEngineId);
    if (!engine) {
      const viewportMap = new Map();
      engine = {
        id: renderingEngineId,
        __viewportMap: viewportMap,
        getViewport: jest.fn((id) => viewportMap.get(id)),
      };
      engines.set(renderingEngineId, engine);
    }
    engine.__viewportMap.set(viewportId, { element });
    elementToViewportInfo.set(element, { renderingEngineId, viewportId });

    return { renderingEngineId, viewportId, element };
  }

  getRenderingEngine.mockImplementation((id) => engines.get(id));
  getRenderingEngines.mockImplementation(() => [...engines.values()]);
  getEnabledElement.mockImplementation((el) => elementToViewportInfo.get(el));

  return { addViewport };
}

describe('Synchronizer', () => {
  let world;

  beforeEach(() => {
    jest.clearAllMocks();
    world = createWorld();
  });

  it('dispatches the event to all targets except the source itself', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-a', 'my-event', callback);
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    // The source is also registered as a target (as `add()` would do); it
    // must not receive its own event.
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-source' });
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target-1' });
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target-2' });

    const event = new CustomEvent('my-event');
    source.element.dispatchEvent(event);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(
      sync,
      { renderingEngineId: 're1', viewportId: 'vp-source' },
      { renderingEngineId: 're1', viewportId: 'vp-target-1' },
      event,
      {}
    );
    expect(callback).toHaveBeenCalledWith(
      sync,
      { renderingEngineId: 're1', viewportId: 'vp-source' },
      { renderingEngineId: 're1', viewportId: 'vp-target-2' },
      event,
      {}
    );
  });

  it('forwards the synchronizer options as the last callback argument', () => {
    const callback = jest.fn();
    const options = { syncColormap: true };
    const sync = new Synchronizer(
      'sync-options',
      'my-event',
      callback,
      options
    );
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    source.element.dispatchEvent(new CustomEvent('my-event'));

    expect(callback).toHaveBeenCalledWith(
      sync,
      expect.objectContaining({ viewportId: 'vp-source' }),
      { renderingEngineId: 're1', viewportId: 'vp-target' },
      expect.anything(),
      options
    );
  });

  it('does not fire while disabled and resumes firing once re-enabled', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-b', 'my-event', callback);
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    sync.setEnabled(false);
    source.element.dispatchEvent(new CustomEvent('my-event'));
    expect(callback).not.toHaveBeenCalled();

    sync.setEnabled(true);
    source.element.dispatchEvent(new CustomEvent('my-event'));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('isDisabled is true when there are no source viewports, even if enabled', () => {
    const sync = new Synchronizer('sync-c', 'my-event', jest.fn());
    expect(sync.isDisabled()).toBe(true);

    const source = world.addViewport('re1', 'vp-source');
    sync.addSource(source);
    expect(sync.isDisabled()).toBe(false);
  });

  it('does not add a duplicate source listener and does not double-fire', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-d', 'my-event', callback);
    const source = world.addViewport('re1', 'vp-source');
    const addListenerSpy = jest.spyOn(source.element, 'addEventListener');

    sync.addSource(source);
    sync.addSource(source);
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    // The synchronizer also (re)registers an ELEMENT_DISABLED listener on
    // every addSource/addTarget call, so filter to the main event name.
    const mainEventAddCalls = addListenerSpy.mock.calls.filter(
      (call) => call[0] === 'my-event'
    );
    expect(mainEventAddCalls).toHaveLength(1);
    expect(sync.getSourceViewports()).toHaveLength(1);

    source.element.dispatchEvent(new CustomEvent('my-event'));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not add a duplicate target', () => {
    const sync = new Synchronizer('sync-d2', 'my-event', jest.fn());
    const target = { renderingEngineId: 're1', viewportId: 'vp-target' };

    sync.addTarget(target);
    sync.addTarget(target);

    expect(sync.getTargetViewports()).toHaveLength(1);
  });

  it('tracks source/target membership via hasSourceViewport/hasTargetViewport', () => {
    const sync = new Synchronizer('sync-e', 'my-event', jest.fn());
    world.addViewport('re1', 'vp-source');

    // Pass a plain {renderingEngineId, viewportId} (rather than the fixture's
    // element-carrying object) so getSourceViewports() below can be compared
    // with a plain toEqual.
    sync.addSource({ renderingEngineId: 're1', viewportId: 'vp-source' });
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    expect(sync.hasSourceViewport('re1', 'vp-source')).toBe(true);
    expect(sync.hasSourceViewport('re1', 'vp-target')).toBe(false);
    expect(sync.hasTargetViewport('re1', 'vp-target')).toBe(true);
    expect(sync.hasTargetViewport('re1', 'vp-source')).toBe(false);

    expect(sync.getSourceViewports()).toEqual([
      { renderingEngineId: 're1', viewportId: 'vp-source' },
    ]);
    expect(sync.getTargetViewports()).toEqual([
      { renderingEngineId: 're1', viewportId: 'vp-target' },
    ]);
  });

  it('stops notifying a target after it is removed, and stops entirely after removeSource', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-f', 'my-event', callback);
    const source = world.addViewport('re1', 'vp-source');
    const target1 = { renderingEngineId: 're1', viewportId: 'vp-target-1' };
    const target2 = { renderingEngineId: 're1', viewportId: 'vp-target-2' };

    sync.addSource(source);
    sync.addTarget(target1);
    sync.addTarget(target2);

    sync.removeTarget(target1);
    source.element.dispatchEvent(new CustomEvent('my-event'));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      sync,
      expect.objectContaining({ viewportId: 'vp-source' }),
      target2,
      expect.anything(),
      {}
    );

    callback.mockClear();
    sync.removeSource(source);
    source.element.dispatchEvent(new CustomEvent('my-event'));
    expect(callback).not.toHaveBeenCalled();
  });

  it('remove() removes a viewport from both the source and target lists', () => {
    const sync = new Synchronizer('sync-remove', 'my-event', jest.fn());
    const viewport = world.addViewport('re1', 'vp1');

    sync.add(viewport);
    expect(sync.hasSourceViewport('re1', 'vp1')).toBe(true);
    expect(sync.hasTargetViewport('re1', 'vp1')).toBe(true);

    sync.remove(viewport);
    expect(sync.hasSourceViewport('re1', 'vp1')).toBe(false);
    expect(sync.hasTargetViewport('re1', 'vp1')).toBe(false);
  });

  it('destroy tears down all listeners and clears source/target lists', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-g', 'my-event', callback);
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    sync.destroy();

    expect(sync.getSourceViewports()).toHaveLength(0);
    expect(sync.getTargetViewports()).toHaveLength(0);

    source.element.dispatchEvent(new CustomEvent('my-event'));
    expect(callback).not.toHaveBeenCalled();
  });

  it('supports the eventTarget event source option', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-h', 'my-event', callback, {
      eventSource: 'eventTarget',
    });
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    getEnabledElementByViewportId.mockImplementation((viewportId) =>
      viewportId === 'vp-source'
        ? { renderingEngineId: 're1', viewportId: 'vp-source' }
        : undefined
    );

    eventTarget.dispatchEvent(
      new CustomEvent('my-event', { detail: { viewportId: 'vp-source' } })
    );

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('no longer receives eventTarget-sourced events after being removed', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-h2', 'my-event', callback, {
      eventSource: 'eventTarget',
    });
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    getEnabledElementByViewportId.mockImplementation((viewportId) =>
      viewportId === 'vp-source'
        ? { renderingEngineId: 're1', viewportId: 'vp-source' }
        : undefined
    );

    sync.removeSource(source);
    eventTarget.dispatchEvent(
      new CustomEvent('my-event', { detail: { viewportId: 'vp-source' } })
    );

    expect(callback).not.toHaveBeenCalled();
  });

  describe('with the eventTarget event source and two rendering engines that have a viewport with the same id', () => {
    let callback;
    let sync;

    beforeEach(() => {
      callback = jest.fn();
      sync = new Synchronizer('sync-h3', 'my-event', callback, {
        eventSource: 'eventTarget',
      });
      world.addViewport('re1', 'vp');
      world.addViewport('re2', 'vp');
      world.addViewport('re1', 'vp-other');
      getEnabledElementByViewportId.mockImplementation((viewportId) => ({
        renderingEngineId: 're1',
        viewportId,
      }));
    });

    afterEach(() => {
      sync.destroy();
    });

    it('takes the source from the rendering engine id of the event', () => {
      sync.add({ renderingEngineId: 're1', viewportId: 'vp' });
      sync.add({ renderingEngineId: 're2', viewportId: 'vp' });

      eventTarget.dispatchEvent(
        new CustomEvent('my-event', {
          detail: { viewportId: 'vp', renderingEngineId: 're2' },
        })
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][1]).toEqual({
        renderingEngineId: 're2',
        viewportId: 'vp',
      });
      expect(callback.mock.calls[0][2]).toEqual({
        renderingEngineId: 're1',
        viewportId: 'vp',
      });
    });

    it('ignores an event of a viewport that is not a source, though a source of another rendering engine has its id', () => {
      sync.addSource({ renderingEngineId: 're1', viewportId: 'vp' });
      sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-other' });

      eventTarget.dispatchEvent(
        new CustomEvent('my-event', {
          detail: { viewportId: 'vp', renderingEngineId: 're2' },
        })
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('ignores an event that gives the viewport id alone', () => {
      sync.add({ renderingEngineId: 're1', viewportId: 'vp' });
      sync.add({ renderingEngineId: 're2', viewportId: 'vp' });

      eventTarget.dispatchEvent(
        new CustomEvent('my-event', { detail: { viewportId: 'vp' } })
      );

      expect(callback).not.toHaveBeenCalled();
    });
  });

  it('listens for auxiliary events in addition to the main event', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-i', 'main-event', callback, {
      auxiliaryEvents: [{ name: 'aux-event' }],
    });
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    sync.addTarget({ renderingEngineId: 're1', viewportId: 'vp-target' });

    source.element.dispatchEvent(new CustomEvent('aux-event'));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('stores and retrieves per-viewport options', () => {
    const sync = new Synchronizer('sync-j', 'my-event', jest.fn());

    expect(sync.getOptions('vp1')).toBeUndefined();
    sync.setOptions('vp1', { foo: 'bar' });
    expect(sync.getOptions('vp1')).toEqual({ foo: 'bar' });
  });

  it('keeps the options of one viewport id apart for each rendering engine, and gives the options set without one to every rendering engine', () => {
    const sync = new Synchronizer('sync-j2', 'my-event', jest.fn());

    sync.setOptions('vp1', { foo: 'all' });
    sync.setOptions('vp1', { foo: 're2' }, 're2');

    expect(sync.getOptions('vp1')).toEqual({ foo: 'all' });
    expect(sync.getOptions('vp1', 're1')).toEqual({ foo: 'all' });
    expect(sync.getOptions('vp1', 're2')).toEqual({ foo: 're2' });

    sync.setOptions('vp1', { foo: 're1' }, 're1');

    expect(sync.getOptions('vp1', 're1')).toEqual({ foo: 're1' });
    expect(sync.getOptions('vp1', 're2')).toEqual({ foo: 're2' });
    expect(sync.getOptions('vp1')).toEqual({ foo: 'all' });
  });

  it('does not fire while there are no target viewports at all', () => {
    const callback = jest.fn();
    const sync = new Synchronizer('sync-k', 'my-event', callback);
    const source = world.addViewport('re1', 'vp-source');

    sync.addSource(source);
    // no targets added

    source.element.dispatchEvent(new CustomEvent('my-event'));
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('SynchronizerManager', () => {
  beforeEach(() => {
    state.synchronizers.length = 0;
  });

  it('creates a synchronizer and retrieves it by id', () => {
    const handler = jest.fn();
    const sync = createSynchronizer('sync-x', 'evt', handler);

    expect(getSynchronizer('sync-x')).toBe(sync);
    expect(getAllSynchronizers()).toContain(sync);
  });

  it('throws when creating a synchronizer with a duplicate id', () => {
    createSynchronizer('dup', 'evt', jest.fn());

    expect(() => createSynchronizer('dup', 'evt', jest.fn())).toThrow(
      "Synchronizer with id 'dup' already exists."
    );
  });

  it('getSynchronizer returns undefined for an unknown id', () => {
    expect(getSynchronizer('does-not-exist')).toBeUndefined();
  });

  it('destroySynchronizer tears the instance down and removes it from state', () => {
    const sync = createSynchronizer('sync-y', 'evt', jest.fn());
    const destroySpy = jest.spyOn(sync, 'destroy');

    destroySynchronizer('sync-y');

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(getSynchronizer('sync-y')).toBeUndefined();
  });

  it('destroySynchronizer is a no-op for an unknown id', () => {
    expect(() => destroySynchronizer('does-not-exist')).not.toThrow();
  });

  it('destroy() clears every synchronizer', () => {
    createSynchronizer('sync-z1', 'evt', jest.fn());
    createSynchronizer('sync-z2', 'evt', jest.fn());

    expect(getAllSynchronizers()).toHaveLength(2);

    destroyAllSynchronizers();

    expect(getAllSynchronizers()).toHaveLength(0);
  });

  describe('getSynchronizersForViewport', () => {
    let world;

    beforeEach(() => {
      jest.clearAllMocks();
      world = createWorld();
    });

    it('returns only enabled synchronizers referencing the given viewport', () => {
      const syncA = createSynchronizer('sync-filter-a', 'evt', jest.fn());
      syncA.addSource(world.addViewport('re1', 'vp1'));

      // A synchronizer is only "enabled" (per isDisabled()) once it has at
      // least one source viewport, so give syncB its own source elsewhere
      // and target vp1 to be picked up via hasTargetViewport.
      const syncB = createSynchronizer('sync-filter-b', 'evt', jest.fn());
      syncB.addSource(world.addViewport('re1', 'vp-other'));
      syncB.addTarget({ renderingEngineId: 're1', viewportId: 'vp1' });

      const syncCDisabled = createSynchronizer(
        'sync-filter-c',
        'evt',
        jest.fn()
      );
      syncCDisabled.addSource(world.addViewport('re1', 'vp1'));
      syncCDisabled.setEnabled(false);

      const syncUnrelated = createSynchronizer(
        'sync-filter-d',
        'evt',
        jest.fn()
      );
      syncUnrelated.addSource(world.addViewport('re1', 'vp2'));

      const result = getSynchronizersForViewport('vp1', 're1');

      expect(result).toEqual([syncA, syncB]);
    });

    it('throws when neither renderingEngineId nor viewportId is given', () => {
      expect(() => getSynchronizersForViewport(undefined, undefined)).toThrow();
    });
  });
});

describe('cameraSyncCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when there is no rendering engine for the target', () => {
    getRenderingEngine.mockReturnValue(undefined);

    expect(() =>
      cameraSyncCallback(
        {},
        { renderingEngineId: 're1', viewportId: 'source' },
        { renderingEngineId: 're1', viewportId: 'target' },
        { detail: { camera: {} } }
      )
    ).toThrow();
  });

  it('copies the view reference and zoom/pan presentation for Generic viewports', () => {
    const sourceViewReference = { FrameOfReferenceUID: 'FOR1' };
    const zoomPanPresentation = { zoom: 2, pan: [1, 1] };
    const zoomPanViewState = { zoom: 2, pan: [1, 1], resolved: true };
    const sourceViewport = {
      getViewReference: jest.fn(() => sourceViewReference),
    };
    const targetViewport = {
      setViewReference: jest.fn(),
      setViewState: jest.fn(),
      render: jest.fn(),
    };

    viewportProjection.getPresentation.mockReturnValueOnce(zoomPanPresentation);
    viewportProjection.withPresentation.mockReturnValueOnce(zoomPanViewState);

    getRenderingEngine.mockImplementation((id) =>
      id === 're-source'
        ? { getViewport: jest.fn(() => sourceViewport) }
        : { getViewport: jest.fn(() => targetViewport) }
    );

    cameraSyncCallback(
      {},
      { renderingEngineId: 're-source', viewportId: 'source' },
      { renderingEngineId: 're-target', viewportId: 'target' },
      { detail: { camera: {} } }
    );

    expect(targetViewport.setViewReference).toHaveBeenCalledWith(
      sourceViewReference
    );
    expect(viewportProjection.getPresentation).toHaveBeenCalledWith(
      sourceViewport,
      { selector: { pan: true, zoom: true } }
    );
    expect(viewportProjection.withPresentation).toHaveBeenCalledWith(
      targetViewport,
      zoomPanPresentation,
      undefined,
      undefined
    );
    expect(targetViewport.setViewState).toHaveBeenCalledWith(zoomPanViewState);
    expect(targetViewport.render).toHaveBeenCalledTimes(1);
  });

  it('bails out when the target viewport cannot be resolved', () => {
    const sourceViewport = { getViewReference: jest.fn(() => ({})) };

    getRenderingEngine.mockImplementation((id) =>
      id === 're-source'
        ? { getViewport: jest.fn(() => sourceViewport) }
        : { getViewport: jest.fn(() => undefined) }
    );

    expect(() =>
      cameraSyncCallback(
        {},
        { renderingEngineId: 're-source', viewportId: 'source' },
        { renderingEngineId: 're-target', viewportId: 'target' },
        { detail: { camera: {} } }
      )
    ).not.toThrow();
    expect(sourceViewport.getViewReference).not.toHaveBeenCalled();
  });

  it('bails out for Generic viewports when the source viewport cannot be resolved', () => {
    const targetViewport = { setViewReference: jest.fn(), render: jest.fn() };
    getRenderingEngine.mockImplementation((id) =>
      id === 're-target'
        ? { getViewport: jest.fn(() => targetViewport) }
        : undefined
    );

    cameraSyncCallback(
      {},
      { renderingEngineId: 're-source', viewportId: 'source' },
      { renderingEngineId: 're-target', viewportId: 'target' },
      { detail: { camera: {} } }
    );

    expect(targetViewport.setViewReference).not.toHaveBeenCalled();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });

  const SQRT_HALF = Math.sqrt(0.5);
  const ZOOM_PAN = { zoom: 2, pan: [3, 4] };
  const UNTURNED = { rotation: 0, flipHorizontal: false, flipVertical: false };

  /**
   * Runs the callback from a planar source to a planar target, each with
   * the view reference and the rotation and flips given, and gives the
   * presentation written to the target, or undefined when none is.
   */
  function presentationWrittenToTarget(source, target) {
    const sourceViewport = {
      type: 'planar',
      getViewReference: jest.fn(() => source.viewReference),
    };
    const targetViewport = {
      type: 'planar',
      getViewReference: jest.fn(() => target.viewReference),
      setViewReference: jest.fn(),
      setViewState: jest.fn(),
      render: jest.fn(),
    };

    viewportProjection.getPresentation.mockImplementation(
      (viewport, { selector }) => {
        if (!selector.rotation) {
          return viewport === sourceViewport ? ZOOM_PAN : undefined;
        }

        return viewport === sourceViewport
          ? source.presentation
          : target.presentation;
      }
    );
    viewportProjection.withPresentation.mockImplementation(
      (_viewport, presentation) => ({ presentation })
    );
    getRenderingEngine.mockImplementation((id) =>
      id === 're-source'
        ? { getViewport: jest.fn(() => sourceViewport) }
        : { getViewport: jest.fn(() => targetViewport) }
    );

    cameraSyncCallback(
      {},
      { renderingEngineId: 're-source', viewportId: 'source' },
      { renderingEngineId: 're-target', viewportId: 'target' },
      { detail: { camera: {} } }
    );

    expect(targetViewport.setViewReference).toHaveBeenCalledWith(
      source.viewReference
    );

    return targetViewport.setViewState.mock.calls[0]?.[0].presentation;
  }

  afterEach(() => {
    viewportProjection.getPresentation.mockImplementation(() => undefined);
    viewportProjection.withPresentation.mockImplementation(() => undefined);
  });

  it('gives a planar target of the same view the rotation of the source, with the zoom and the pan', () => {
    expect(
      presentationWrittenToTarget(
        {
          viewReference: {
            viewPlaneNormal: [0, 0, -1],
            viewUp: [-SQRT_HALF, -SQRT_HALF, 0],
          },
          presentation: { ...UNTURNED, rotation: 45 },
        },
        {
          viewReference: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
          presentation: UNTURNED,
        }
      )
    ).toEqual({
      ...ZOOM_PAN,
      rotation: 45,
      flipHorizontal: false,
      flipVertical: false,
    });
  });

  it('gives a planar target the flips and the rotation of a flipped source', () => {
    expect(
      presentationWrittenToTarget(
        {
          viewReference: {
            viewPlaneNormal: [0, 0, 1],
            viewUp: [0.5, -Math.sqrt(0.75), 0],
          },
          presentation: { ...UNTURNED, rotation: 30, flipHorizontal: true },
        },
        {
          viewReference: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
          presentation: UNTURNED,
        }
      )
    ).toEqual({
      ...ZOOM_PAN,
      rotation: 30,
      flipHorizontal: true,
      flipVertical: false,
    });
  });

  it('does not turn again a planar target that the view reference turned to the view up of the source', () => {
    const viewReference = {
      viewPlaneNormal: [0, 0, -1],
      viewUp: [-SQRT_HALF, -SQRT_HALF, 0],
    };

    expect(
      presentationWrittenToTarget(
        { viewReference, presentation: { ...UNTURNED, rotation: 45 } },
        { viewReference, presentation: UNTURNED }
      )
    ).toEqual({
      ...ZOOM_PAN,
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    });
  });

  it('copies only the zoom and the pan to a planar target of another plane', () => {
    expect(
      presentationWrittenToTarget(
        {
          viewReference: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
          presentation: UNTURNED,
        },
        {
          viewReference: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
          presentation: UNTURNED,
        }
      )
    ).toEqual(ZOOM_PAN);
  });
});

describe('voiSyncCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('propagates invert and colormap to a next viewport only when the matching sync options are enabled', () => {
    const tViewport = {
      setDisplaySetPresentation: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn(() => tViewport),
    });

    voiSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      {
        detail: {
          range: { lower: 0, upper: 1 },
          invert: true,
          colormap: { name: 'hot' },
        },
      },
      { syncInvertState: true, syncColormap: true }
    );

    expect(tViewport.setDisplaySetPresentation).toHaveBeenCalledWith({
      voiRange: { lower: 0, upper: 1 },
      invert: true,
      colormap: { name: 'hot' },
    });
  });

  it('does not propagate invert or colormap to a next viewport without the matching options', () => {
    const tViewport = {
      setDisplaySetPresentation: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn(() => tViewport),
    });

    voiSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      {
        detail: {
          range: { lower: 0, upper: 1 },
          invert: true,
          colormap: { name: 'hot' },
        },
      }
    );

    expect(tViewport.setDisplaySetPresentation).toHaveBeenCalledWith({
      voiRange: { lower: 0, upper: 1 },
    });
  });

  it('gives the target the invert of a next source viewport, which sets no invertStateChanged', () => {
    const tViewport = {
      setDisplaySetPresentation: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn(() => tViewport),
    });

    voiSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      { detail: { range: { lower: 0, upper: 1 }, invert: false } },
      { syncInvertState: true }
    );
    voiSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      { detail: { range: { lower: 0, upper: 1 } } },
      { syncInvertState: true }
    );

    expect(tViewport.setDisplaySetPresentation.mock.calls).toEqual([
      [{ voiRange: { lower: 0, upper: 1 }, invert: false }],
      [{ voiRange: { lower: 0, upper: 1 } }],
    ]);
  });

  it('routes to the matching display-set binding on Generic viewports', () => {
    const tViewport = {
      findDataIdByVolumeId: jest.fn(() => 'data-1'),
      setDisplaySetPresentation: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn(() => tViewport),
    });

    voiSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      { detail: { volumeId: 'v1', range: { lower: 0, upper: 1 } } }
    );

    expect(tViewport.setDisplaySetPresentation).toHaveBeenCalledWith('data-1', {
      voiRange: { lower: 0, upper: 1 },
    });
    expect(tViewport.render).toHaveBeenCalledTimes(1);
  });

  it('applies to the default binding on Generic viewports when there is no source volumeId', () => {
    const tViewport = {
      setDisplaySetPresentation: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn(() => tViewport),
    });

    voiSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      { detail: { range: { lower: 0, upper: 1 } } }
    );

    expect(tViewport.setDisplaySetPresentation).toHaveBeenCalledWith({
      voiRange: { lower: 0, upper: 1 },
    });
  });

  it('skips Generic viewports without a matching volume binding, but still renders', () => {
    const tViewport = {
      findDataIdByVolumeId: jest.fn(() => undefined),
      setDisplaySetPresentation: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn(() => tViewport),
    });

    voiSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      {
        detail: { volumeId: 'unmatched-volume', range: { lower: 0, upper: 1 } },
      }
    );

    expect(tViewport.setDisplaySetPresentation).not.toHaveBeenCalled();
    expect(tViewport.render).toHaveBeenCalledTimes(1);
  });

  it('throws when there is no rendering engine for the target', () => {
    getRenderingEngine.mockReturnValue(undefined);

    expect(() =>
      voiSyncCallback(
        {},
        { renderingEngineId: 're', viewportId: 'source' },
        { renderingEngineId: 're', viewportId: 'target' },
        { detail: {} }
      )
    ).toThrow();
  });
});

describe('slabThicknessSyncCallback', () => {
  /**
   * A stand-in of a next viewport in the content mode given, volume by
   * default, whose display sets have the slab thicknesses given, the first
   * one as its source display set.
   */
  function makeSlabViewport(slabThicknesses, mode = 'volume') {
    const presentations = new Map(
      Object.entries(slabThicknesses).map(([displaySetId, slabThickness]) => [
        displaySetId,
        { slabThickness },
      ])
    );

    return {
      getCurrentMode: jest.fn(() => mode),
      getSourceDataId: jest.fn(() => Object.keys(slabThicknesses)[0]),
      getDefaultVOIRange: jest.fn(),
      getDisplaySets: jest.fn(() =>
        Object.keys(slabThicknesses).map((displaySetId) => ({ displaySetId }))
      ),
      getDisplaySetPresentation: jest.fn((displaySetId) =>
        presentations.get(displaySetId)
      ),
      setDisplaySetPresentation: jest.fn(),
      render: jest.fn(),
    };
  }

  function syncSlab(sourceViewport, targetViewport) {
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn((id) =>
        id === 'source' ? sourceViewport : targetViewport
      ),
    });

    slabThicknessSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' }
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gives the slab of the source display set to each display set of the target whose slab differs, and renders', () => {
    const sourceViewport = makeSlabViewport({ ct: 5 });
    const targetViewport = makeSlabViewport({ ct: 1, pt: 5, seg: undefined });

    syncSlab(sourceViewport, targetViewport);

    expect(targetViewport.setDisplaySetPresentation.mock.calls).toEqual([
      ['ct', { slabThickness: 5 }],
      ['seg', { slabThickness: 5 }],
    ]);
    expect(targetViewport.render).toHaveBeenCalledTimes(1);
  });

  it('does nothing when every display set of the target has the slab of the source', () => {
    const sourceViewport = makeSlabViewport({ ct: 5 });
    const targetViewport = makeSlabViewport({ ct: 5, pt: 5 });

    syncSlab(sourceViewport, targetViewport);

    expect(targetViewport.setDisplaySetPresentation).not.toHaveBeenCalled();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });

  it('does nothing for a source that shows a stack, which draws no slab', () => {
    const sourceViewport = makeSlabViewport({ stack: undefined }, 'stack');
    const targetViewport = makeSlabViewport({ ct: 5 });

    syncSlab(sourceViewport, targetViewport);

    expect(targetViewport.setDisplaySetPresentation).not.toHaveBeenCalled();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });

  it('clears the slab of the target for a volume source without a slab', () => {
    const sourceViewport = makeSlabViewport({ ct: undefined });
    const targetViewport = makeSlabViewport({ ct: 5 });

    syncSlab(sourceViewport, targetViewport);

    expect(targetViewport.setDisplaySetPresentation.mock.calls).toEqual([
      ['ct', { slabThickness: undefined }],
    ]);
  });

  it('does nothing when the source viewport has no display set presentation', () => {
    const targetViewport = makeSlabViewport({ ct: 1 });

    syncSlab({ render: jest.fn() }, targetViewport);

    expect(targetViewport.setDisplaySetPresentation).not.toHaveBeenCalled();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });

  it('does not throw for a target without display set presentation', () => {
    const targetViewport = { render: jest.fn() };

    expect(() =>
      syncSlab(makeSlabViewport({ ct: 5 }), targetViewport)
    ).not.toThrow();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });

  it('reads the source from its own rendering engine when the target is in another one', () => {
    const sourceViewport = makeSlabViewport({ ct: 5 });
    const targetViewport = makeSlabViewport({ ct: 1 });
    const engines = {
      engineA: {
        getViewport: (id) => (id === 'source' ? sourceViewport : undefined),
      },
      engineB: {
        getViewport: (id) => (id === 'target' ? targetViewport : undefined),
      },
    };

    getRenderingEngine.mockImplementation((id) => engines[id]);
    slabThicknessSyncCallback(
      {},
      { renderingEngineId: 'engineA', viewportId: 'source' },
      { renderingEngineId: 'engineB', viewportId: 'target' }
    );

    expect(sourceViewport.getDisplaySetPresentation).toHaveBeenCalled();
    expect(targetViewport.setDisplaySetPresentation.mock.calls).toEqual([
      ['ct', { slabThickness: 5 }],
    ]);
  });

  it('does nothing, and does not throw, when the source or the target viewport is disabled', () => {
    const sourceViewport = makeSlabViewport({ ct: 5 });
    const targetViewport = makeSlabViewport({ ct: 1 });

    expect(() => syncSlab(undefined, targetViewport)).not.toThrow();
    expect(() => syncSlab(sourceViewport, undefined)).not.toThrow();
    expect(targetViewport.setDisplaySetPresentation).not.toHaveBeenCalled();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });

  it('throws when there is no rendering engine for the target', () => {
    getRenderingEngine.mockReturnValue(undefined);

    expect(() =>
      slabThicknessSyncCallback(
        {},
        { renderingEngineId: 're', viewportId: 'source' },
        { renderingEngineId: 're', viewportId: 'target' }
      )
    ).toThrow();
  });
});

describe('presentationViewSyncCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    viewportProjection.getPresentation.mockReturnValue(undefined);
    viewportProjection.withPresentation.mockReturnValue(undefined);
  });

  it('applies the source presentation to the target and renders', () => {
    const presentation = { zoom: 1.5 };
    const nextViewState = { zoom: 1.5, resolved: true };
    viewportProjection.getPresentation.mockReturnValue(presentation);
    viewportProjection.withPresentation.mockReturnValue(nextViewState);

    const sourceViewport = {};
    const targetViewport = {
      setViewState: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn((id) =>
        id === 'source' ? sourceViewport : targetViewport
      ),
    });

    presentationViewSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' },
      {},
      { viewPresentation: { zoom: true } }
    );

    expect(viewportProjection.getPresentation).toHaveBeenCalledWith(
      sourceViewport,
      { selector: { zoom: true } }
    );
    expect(viewportProjection.withPresentation).toHaveBeenCalledWith(
      targetViewport,
      presentation,
      undefined,
      undefined
    );
    expect(targetViewport.setViewState).toHaveBeenCalledWith(nextViewState);
    expect(targetViewport.render).toHaveBeenCalledTimes(1);
  });

  it('reads the source from its own rendering engine when the target is a viewport with the same id in another one', () => {
    const presentation = { zoom: 2 };
    viewportProjection.getPresentation.mockImplementation((viewport) =>
      viewport === sourceViewport ? presentation : { zoom: 1 }
    );
    viewportProjection.withPresentation.mockImplementation(
      (_viewport, appliedPresentation) => ({ ...appliedPresentation })
    );

    const sourceViewport = {};
    const targetViewport = {
      setViewState: jest.fn(),
      render: jest.fn(),
    };
    const engines = {
      engineA: {
        getViewport: (id) => (id === 'vp' ? sourceViewport : undefined),
      },
      engineB: {
        getViewport: (id) => (id === 'vp' ? targetViewport : undefined),
      },
    };

    getRenderingEngine.mockImplementation((id) => engines[id]);
    presentationViewSyncCallback(
      {},
      { renderingEngineId: 'engineA', viewportId: 'vp' },
      { renderingEngineId: 'engineB', viewportId: 'vp' },
      {},
      { viewPresentation: { zoom: true } }
    );

    expect(viewportProjection.getPresentation).toHaveBeenCalledWith(
      sourceViewport,
      { selector: { zoom: true } }
    );
    expect(targetViewport.setViewState).toHaveBeenCalledWith({ zoom: 2 });
    expect(targetViewport.render).toHaveBeenCalledTimes(1);
  });

  it('does not render when there is no presentation to apply', () => {
    const sourceViewport = {};
    const targetViewport = {
      setViewState: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn((id) =>
        id === 'source' ? sourceViewport : targetViewport
      ),
    });

    presentationViewSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' }
    );

    expect(targetViewport.setViewState).not.toHaveBeenCalled();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });

  it('uses setViewState when the projection registry resolves a Generic view state', () => {
    const presentation = { rotation: 90 };
    const nextViewState = { rotation: 90, resolved: true };
    viewportProjection.getPresentation.mockReturnValue(presentation);
    viewportProjection.withPresentation.mockReturnValue(nextViewState);

    const sourceViewport = {};
    const targetViewport = {
      setViewState: jest.fn(),
      render: jest.fn(),
    };
    getRenderingEngine.mockReturnValue({
      getViewport: jest.fn((id) =>
        id === 'source' ? sourceViewport : targetViewport
      ),
    });

    presentationViewSyncCallback(
      {},
      { renderingEngineId: 're', viewportId: 'source' },
      { renderingEngineId: 're', viewportId: 'target' }
    );

    expect(targetViewport.setViewState).toHaveBeenCalledWith(nextViewState);
    expect(targetViewport.render).toHaveBeenCalledTimes(1);
  });

  it('throws when there is no rendering engine for the target', () => {
    getRenderingEngine.mockReturnValue(undefined);

    expect(() =>
      presentationViewSyncCallback(
        {},
        { renderingEngineId: 're', viewportId: 'source' },
        { renderingEngineId: 're', viewportId: 'target' }
      )
    ).toThrow();
  });
});

describe('areViewportsCoplanar', () => {
  const makeViewport = (viewPlaneNormal) => ({
    getViewReference: () => ({ viewPlaneNormal }),
    getResolvedView: () => ({ toICamera: () => ({ viewPlaneNormal }) }),
  });

  it('returns true for viewports with the same normal', () => {
    expect(
      areViewportsCoplanar(makeViewport([0, 0, 1]), makeViewport([0, 0, 1]))
    ).toBe(true);
  });

  it('treats antiparallel (opposite-sign) normals as coplanar', () => {
    expect(
      areViewportsCoplanar(makeViewport([0, 0, 1]), makeViewport([0, 0, -1]))
    ).toBe(true);
  });

  it('returns false for perpendicular normals', () => {
    expect(
      areViewportsCoplanar(makeViewport([0, 0, 1]), makeViewport([1, 0, 0]))
    ).toBe(false);
  });

  it('returns false for normals beyond the 0.9 dot-product tolerance', () => {
    // dot([0,0,1], [0, 0.5, 0.866]) === 0.866, which is < 0.9
    expect(
      areViewportsCoplanar(
        makeViewport([0, 0, 1]),
        makeViewport([0, 0.5, 0.866])
      )
    ).toBe(false);
  });

  it('returns true for normals within the 0.9 dot-product tolerance', () => {
    // dot([0,0,1], [0, 0.3, 0.9539]) === 0.9539, which is > 0.9
    expect(
      areViewportsCoplanar(
        makeViewport([0, 0, 1]),
        makeViewport([0, 0.3, 0.9539])
      )
    ).toBe(true);
  });
});
