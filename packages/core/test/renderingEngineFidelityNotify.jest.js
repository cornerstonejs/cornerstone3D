import { describe, it, expect, jest } from '@jest/globals';
import BaseRenderingEngine from '../src/RenderingEngine/BaseRenderingEngine';
import Viewport from '../src/RenderingEngine/Viewport';
import GenericViewport from '../src/RenderingEngine/GenericViewport/GenericViewport';
import Events from '../src/enums/Events';
import actorsWaitingForStorage from '../src/RenderingEngine/helpers/actorsWaitingForStorage';

function viewportStub(id) {
  return { id, notifyFidelityStateChanged: jest.fn() };
}

function engineStub(viewports) {
  return {
    hasBeenDestroyed: false,
    _viewports: new Map(viewports.map((viewport) => [viewport.id, viewport])),
  };
}

const notifyRendered = (engine, viewports) =>
  BaseRenderingEngine.prototype._notifyFidelityOfRenderedViewports.call(
    engine,
    viewports
  );

describe('rendering engine fidelity notification (FIDELITY-EVENT-2)', () => {
  it('skips a viewport that an IMAGE_RENDERED listener disabled', () => {
    const kept = viewportStub('kept');
    const disabled = viewportStub('disabled');
    const engine = engineStub([kept, disabled]);

    engine._viewports.delete(disabled.id);
    notifyRendered(engine, [kept, disabled]);

    expect(kept.notifyFidelityStateChanged).toHaveBeenCalledTimes(1);
    expect(disabled.notifyFidelityStateChanged).not.toHaveBeenCalled();
  });

  it('notifies nothing after an IMAGE_RENDERED listener destroyed the engine', () => {
    const viewport = viewportStub('vp');
    const engine = engineStub([viewport]);

    // A destroy resets the viewport map and sets the flag.
    engine._viewports = new Map();
    engine.hasBeenDestroyed = true;
    notifyRendered(engine, [viewport]);

    expect(viewport.notifyFidelityStateChanged).not.toHaveBeenCalled();
  });

  it('does no fidelity work for a viewport that cannot report fidelity', () => {
    // An ECG, video or WSI viewport keeps the base answer `false`.
    const viewports = [Viewport, GenericViewport].map((ViewportClass, i) =>
      Object.assign(Object.create(ViewportClass.prototype), {
        id: `vp-${i}`,
        renderingEngineId: 're-1',
        element: document.createElement('div'),
        collectFidelityLines: jest.fn(
          ViewportClass.prototype.collectFidelityLines
        ),
        forEachBinding: () => {},
        getResolvedView: () => undefined,
        getCamera: () => undefined,
      })
    );
    const events = [];
    for (const viewport of viewports) {
      viewport.element.addEventListener(Events.VIEWPORT_FIDELITY_CHANGED, () =>
        events.push(viewport.id)
      );
    }

    notifyRendered(engineStub(viewports), viewports);

    for (const viewport of viewports) {
      expect(viewport.collectFidelityLines).not.toHaveBeenCalled();
      expect(viewport.getFidelityState().shownState).toBe('hidden');
    }
    expect(events).toEqual([]);
  });
});

describe('rendering engine and a draw that waits for texture storage', () => {
  const waits = (actors, renderStart) =>
    BaseRenderingEngine.prototype._waitsForStorage.call(
      {},
      { getActors: () => actors.map((actor) => ({ actor })) },
      renderStart
    );

  it('withholds the events only when no actor of the render drew', () => {
    const ct = {};
    const pet = {};
    const renderStart = performance.now();

    actorsWaitingForStorage.set(ct, performance.now());
    expect(waits([ct], renderStart)).toBe(true);
    // A PET that drew over a waiting CT keeps IMAGE_RENDERED for the annotations.
    expect(waits([ct, pet], renderStart)).toBe(false);
  });

  it('ignores a skip from an earlier render', () => {
    const ct = {};

    actorsWaitingForStorage.set(ct, performance.now() - 100);
    expect(waits([ct], performance.now())).toBe(false);
  });
});
