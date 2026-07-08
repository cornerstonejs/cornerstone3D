import eventTarget from '../../eventTarget';
import { Events } from '../../enums';
import triggerEvent from '../../utilities/triggerEvent';
import type { VtkOffscreenMultiRenderWindow } from '../../types';

/**
 * Forwards WebGL context lost/restored events from a rendering engine's
 * offscreen canvas to the cornerstone eventTarget as WEBGL_CONTEXT_LOST /
 * WEBGL_CONTEXT_RESTORED.
 *
 * Cornerstone never switches render backends on its own: these events exist
 * so applications can detect GPU degradation, prompt the user, and call
 * setRenderBackend('cpu') themselves. vtk.js keeps its own listeners on the
 * same canvas (preventDefault + restore attempt), which these do not disturb.
 */
export function attachWebGLContextEvents(
  offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow,
  renderingEngineId: string,
  contextIndex = 0
): void {
  const canvas = (
    offscreenMultiRenderWindow.getOpenGLRenderWindow?.() as {
      getCanvas?: () => HTMLCanvasElement | undefined;
    }
  )?.getCanvas?.();

  if (!canvas) {
    return;
  }

  canvas.addEventListener('webglcontextlost', () => {
    console.warn(
      `CornerstoneRender: WebGL context lost (renderingEngine=${renderingEngineId}, context=${contextIndex})`
    );
    triggerEvent(eventTarget, Events.WEBGL_CONTEXT_LOST, {
      renderingEngineId,
      contextIndex,
    });
  });

  canvas.addEventListener('webglcontextrestored', () => {
    triggerEvent(eventTarget, Events.WEBGL_CONTEXT_RESTORED, {
      renderingEngineId,
      contextIndex,
    });
  });
}
