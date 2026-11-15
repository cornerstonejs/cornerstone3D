import { describe, it, expect } from '@jest/globals';
import BaseRenderingEngine from '../src/RenderingEngine/BaseRenderingEngine';

/**
 * The part of a rendering engine that `_deferHeldViewports` reads: the ids
 * that wait for a frame and the viewports by id.
 */
function createEngineState(viewports) {
  return {
    _needsRender: new Set(Object.keys(viewports)),
    _viewports: new Map(Object.entries(viewports)),
  };
}

describe('BaseRenderingEngine._deferHeldViewports', () => {
  const deferHeldViewports = BaseRenderingEngine.prototype._deferHeldViewports;

  it('takes a viewport that holds its renders out of the frame', () => {
    const state = createEngineState({
      held: { deferRenderWhileHeld: () => true },
      free: { deferRenderWhileHeld: () => false },
      legacy: {},
    });

    deferHeldViewports.call(state);

    expect([...state._needsRender]).toEqual(['free', 'legacy']);
  });

  it('asks only the viewports that wait for a frame', () => {
    const asked = [];
    const state = createEngineState({
      waiting: {
        deferRenderWhileHeld: () => {
          asked.push('waiting');

          return true;
        },
      },
    });

    state._viewports.set('idle', {
      deferRenderWhileHeld: () => {
        asked.push('idle');

        return true;
      },
    });
    deferHeldViewports.call(state);

    expect(asked).toEqual(['waiting']);
    expect(state._needsRender.size).toBe(0);
  });

  it('keeps an id whose viewport is gone', () => {
    const state = createEngineState({});

    state._needsRender.add('removed');
    deferHeldViewports.call(state);

    expect([...state._needsRender]).toEqual(['removed']);
  });
});
