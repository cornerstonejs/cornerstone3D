import vtkForwardPass from '@kitware/vtk.js/Rendering/OpenGL/ForwardPass';
import eventTarget from '../../eventTarget';
import { Events } from '../../enums';
import triggerEvent from '../../utilities/triggerEvent';
import type { VtkOffscreenMultiRenderWindow } from '../../types';
import { coreLog } from '../../utilities/logger';
import volumeTextureStore from '../../cache/volumeTextureStore';

const log = coreLog.getLogger('RenderingEngine', 'attachWebGLContextEvents');

/** The parts of a vtk.js OpenGL view node that a context restore uses. */
type OpenGLViewNode = {
  getChildren: () => OpenGLViewNode[];
  removeNode: (child: OpenGLViewNode) => boolean;
};

/** The parts of a vtk.js render pass that a context restore uses. */
type OpenGLRenderPass = {
  isA: (className: string) => boolean;
};

/** The parts of the vtk.js OpenGL render window that a context restore uses. */
type OpenGLRenderWindow = OpenGLViewNode & {
  getCanvas?: () => HTMLCanvasElement | undefined;
  getContext?: () => WebGLRenderingContext | WebGL2RenderingContext | null;
  getInitialized: () => boolean;
  setInitialized: (initialized: boolean) => boolean;
  isDeleted: () => boolean;
  releaseGraphicsResources: () => void;
  getRenderPasses: () => OpenGLRenderPass[];
  setRenderPasses: (passes: OpenGLRenderPass[]) => boolean;
};

/** A texture of the texture store that can drop the storage of a lost context. */
type LostContextTexture = {
  releaseLostContextResources?: (openGLRenderWindow: unknown) => boolean;
};

/** The vtk.js OpenGL render window of an offscreen render window. */
function openGLRenderWindowOf(
  offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow | undefined
): OpenGLRenderWindow | undefined {
  return offscreenMultiRenderWindow?.getOpenGLRenderWindow?.() as unknown as
    | OpenGLRenderWindow
    | undefined;
}

/**
 * Whether the WebGL context of an offscreen render window is lost now. A
 * window that never drew holds no context and is not lost.
 */
export function isWebGLContextLost(
  offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow | undefined
): boolean {
  const context = openGLRenderWindowOf(
    offscreenMultiRenderWindow
  )?.getContext?.();

  return !!context?.isContextLost?.();
}

/**
 * Drops every GL object of an offscreen render window after its WebGL context
 * came back, so the next render builds them again in the new context.
 *
 * vtk.js listens on the same canvas and calls its `restoreContext` first, but
 * that runs a render pass with no delegates, so it releases nothing: every
 * handle that vtk.js holds (programs, buffers, textures, framebuffers) still
 * points into the lost context, and no mapper rebuilds, because a stale handle
 * is not zero. This function therefore:
 * - drops the storage of each streaming volume texture that this window holds,
 *   so the next build allocates it again and refills every slice from the
 *   voxels in memory;
 * - releases the shared resources of the window (the shader cache, the shared
 *   colour and opacity textures, the texture units);
 * - removes the view nodes of the renderers, so vtk.js makes new nodes for
 *   every renderer, actor and mapper at the next render, each with no GL
 *   object yet (VBOs, VAOs, the 2D textures of the image mappers);
 * - replaces the forward pass, whose framebuffer belongs to the lost context;
 * - marks the window not initialized, so the next render sets the GL state
 *   again (blending, depth function) and makes a new texture unit manager.
 *
 * The size of the window and of its canvas do not change with a context, and
 * the CPU data (volumes, images, `vtkImageData` of the actors) stays as it
 * is. A window that never drew holds nothing to drop.
 */
export function releaseLostContextResources(
  offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow
): void {
  const openGLRenderWindow = openGLRenderWindowOf(offscreenMultiRenderWindow);

  if (
    !openGLRenderWindow ||
    openGLRenderWindow.isDeleted() ||
    !openGLRenderWindow.getInitialized()
  ) {
    return;
  }

  volumeTextureStore
    .textures<LostContextTexture>()
    .forEach((texture) =>
      texture?.releaseLostContextResources?.(openGLRenderWindow)
    );

  openGLRenderWindow.releaseGraphicsResources();
  [...openGLRenderWindow.getChildren()].forEach((child) =>
    openGLRenderWindow.removeNode(child)
  );
  openGLRenderWindow.setRenderPasses(
    openGLRenderWindow
      .getRenderPasses()
      .map((pass) =>
        pass.isA('vtkForwardPass') ? vtkForwardPass.newInstance() : pass
      )
  );
  openGLRenderWindow.setInitialized(false);
}

/**
 * Forwards WebGL context lost/restored events from a rendering engine's
 * offscreen canvas to the cornerstone eventTarget as WEBGL_CONTEXT_LOST /
 * WEBGL_CONTEXT_RESTORED.
 *
 * Cornerstone never switches render backends on its own: these events exist
 * so applications can detect GPU degradation, prompt the user, and call
 * setRenderBackend('cpu') themselves. vtk.js keeps its own listeners on the
 * same canvas (preventDefault, which allows the browser to restore the
 * context), which these do not disturb.
 *
 * When the context comes back, the GL objects of the window are dropped
 * (`releaseLostContextResources`) before WEBGL_CONTEXT_RESTORED fires, and
 * then `onContextRestored` runs, so the engine can render again the viewports
 * that draw through this context.
 *
 * @returns a function that removes the listeners
 */
export function attachWebGLContextEvents(
  offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow,
  renderingEngineId: string,
  contextIndex = 0,
  onContextRestored?: () => void
): () => void {
  const canvas = openGLRenderWindowOf(
    offscreenMultiRenderWindow
  )?.getCanvas?.();

  if (!canvas) {
    return () => undefined;
  }

  const onLost = () => {
    log.warn(
      `CornerstoneRender: WebGL context lost (renderingEngine=${renderingEngineId}, context=${contextIndex})`
    );
    triggerEvent(eventTarget, Events.WEBGL_CONTEXT_LOST, {
      renderingEngineId,
      contextIndex,
    });
  };

  const onRestored = () => {
    releaseLostContextResources(offscreenMultiRenderWindow);
    triggerEvent(eventTarget, Events.WEBGL_CONTEXT_RESTORED, {
      renderingEngineId,
      contextIndex,
    });
    onContextRestored?.();
  };

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
