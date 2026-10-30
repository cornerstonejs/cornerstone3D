import { describe, it, expect, jest } from '@jest/globals';
import BaseRenderingEngine from '../src/RenderingEngine/BaseRenderingEngine';

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
});
