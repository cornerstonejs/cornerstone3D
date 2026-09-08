import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkWebGPURenderWindow from '@kitware/vtk.js/Rendering/WebGPU/RenderWindow';
import renderingEngineCache from '../../renderingEngineCache';
// Registers the WebGPU view-node overrides (renderer, actors, image mappers,
// textures, ...) on the WebGPU view-node factory so the scene graph can be
// built for the WebGPU view API.
import '@kitware/vtk.js/Rendering/WebGPU/Profiles/All';

/**
 * Minimal typed surface of the vtk.js WebGPU render window (the module ships
 * without type definitions). Only the members this wrapper touches.
 */
interface WebGPUView {
  setSize(width: number, height: number): void;
  getSize(): [number, number] | undefined;
  getCanvas(): HTMLCanvasElement;
  getInitialized(): boolean;
  getDevice():
    | {
        getHandle(): GPUDevice;
      }
    | undefined;
  onInitialized(callback: () => void): { unsubscribe(): void };
  traverseAllPasses(): void;
  delete(): void;
}

/**
 * A per-viewport WebGPU rendering context: one core vtkRenderWindow with a
 * vtk.js WebGPU view and a single renderer. The WebGPU canvas stays detached
 * from the DOM; frames are blitted into the viewport's visible canvas in the
 * same task that submits them.
 *
 * This intentionally does NOT go through the engine's shared offscreen
 * OpenGL multi-render-window: the render path that owns this window is
 * self-rendering (its attachment exposes `render()`), so the engine's
 * WebGL render/blit cycle never touches the viewport.
 */
export interface WebGPUViewportWindow {
  renderWindow: ReturnType<typeof vtkRenderWindow.newInstance>;
  view: WebGPUView;
  renderer: ReturnType<typeof vtkRenderer.newInstance>;
  refCount: number;
  /**
   * Set when the last binding releases the window. The initialization
   * callback must bail out instead of touching the deleted vtk objects.
   */
  destroyed: boolean;
}

const windowsByViewportId = new Map<string, WebGPUViewportWindow>();

// Debug handle for the experimental backend: lets devtools sessions inspect
// the detached per-viewport WebGPU windows (canvas, renderer, device state).
(globalThis as { __cs3dWebGPUWindows?: unknown }).__cs3dWebGPUWindows =
  windowsByViewportId;

/**
 * Whether WebGPU rendering can be attempted in this environment.
 * Adapter/device acquisition is asynchronous and can still fail later; this
 * is only the synchronous gate used for registration/selection.
 */
export function isWebGPURenderingAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * Gets (or lazily creates) the shared WebGPU window for a viewport.
 * Reference-counted so a source binding and overlays share one device/canvas.
 */
export function acquireWebGPUViewportWindow(
  viewportId: string,
  options?: { renderingEngineId?: string }
): WebGPUViewportWindow {
  let entry = windowsByViewportId.get(viewportId);

  if (!entry) {
    const renderWindow = vtkRenderWindow.newInstance();
    const view = vtkWebGPURenderWindow.newInstance() as unknown as WebGPUView;

    renderWindow.addView(
      view as unknown as Parameters<typeof renderWindow.addView>[0]
    );

    const renderer = vtkRenderer.newInstance({
      background: resolveViewportBackground(
        options?.renderingEngineId,
        viewportId
      ),
    });
    renderer.getActiveCamera().setParallelProjection(true);
    renderWindow.addRenderer(renderer);

    entry = { renderWindow, view, renderer, refCount: 0, destroyed: false };
    windowsByViewportId.set(viewportId, entry);
  }

  entry.refCount += 1;
  return entry;
}

/**
 * Resolves the viewport's configured background so the WebGPU renderer
 * clears with the same color the WebGL offscreen renderer would use.
 */
function resolveViewportBackground(
  renderingEngineId: string | undefined,
  viewportId: string
): [number, number, number] {
  try {
    const viewport = renderingEngineId
      ? renderingEngineCache.get(renderingEngineId)?.getViewport(viewportId)
      : undefined;
    const background = (
      viewport as { defaultOptions?: { background?: [number, number, number] } }
    )?.defaultOptions?.background;

    return background ?? [0, 0, 0];
  } catch {
    return [0, 0, 0];
  }
}

/** Releases one reference; destroys the window when the last binding leaves. */
export function releaseWebGPUViewportWindow(viewportId: string): void {
  const entry = windowsByViewportId.get(viewportId);

  if (!entry) {
    return;
  }

  entry.refCount -= 1;

  if (entry.refCount <= 0) {
    entry.destroyed = true;
    windowsByViewportId.delete(viewportId);
    entry.renderWindow.removeRenderer(entry.renderer);
    entry.renderer.delete();
    entry.view.delete();
    entry.renderWindow.delete();
  }
}

/**
 * Renders the WebGPU scene and blits the result into `targetCanvas` (the
 * viewport's visible surface canvas). Canvas reads synchronize submitted GPU
 * work, so the copy must stay in the same task as `traverseAllPasses()`. In
 * particular, WebKit can retire the presented WebGPU texture before a copy
 * deferred through `GPUQueue.onSubmittedWorkDone()`, producing a black frame.
 * The first frame remains asynchronous because vtk.js acquires its adapter and
 * device during the initial traverse; vtk.js submits that queued traversal
 * before invoking our initialization callback.
 */
export function renderWebGPUViewportWindow(
  entry: WebGPUViewportWindow,
  targetCanvas: HTMLCanvasElement,
  onBlitted?: () => void
): void {
  if (entry.destroyed) {
    return;
  }

  const { view } = entry;
  const width = Math.max(targetCanvas.width, 1);
  const height = Math.max(targetCanvas.height, 1);
  const [currentWidth, currentHeight] = view.getSize() ?? [0, 0];

  if (currentWidth !== width || currentHeight !== height) {
    view.setSize(width, height);
  }

  // Handles the uninitialized case internally by queueing a traverse for
  // when the device becomes ready.
  view.traverseAllPasses();

  const blit = () => {
    if (entry.destroyed) {
      return;
    }

    const source = view.getCanvas();
    const context = targetCanvas.getContext('2d');

    if (!source || !context || source.width === 0 || source.height === 0) {
      return;
    }

    context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    context.drawImage(
      source,
      0,
      0,
      source.width,
      source.height,
      0,
      0,
      targetCanvas.width,
      targetCanvas.height
    );
    onBlitted?.();
  };

  if (view.getInitialized()) {
    blit();
  } else {
    const subscription = view.onInitialized(() => {
      subscription.unsubscribe();
      blit();
    });
  }
}

/**
 * Overrides the background clear color of a viewport's WebGPU window (e.g.
 * so examples can visually distinguish the webgpu backend from the WebGL
 * one). No-op when the viewport has no live WebGPU window.
 */
export function setWebGPUViewportBackground(
  viewportId: string,
  background: [number, number, number]
): boolean {
  const entry = windowsByViewportId.get(viewportId);

  if (!entry || entry.destroyed) {
    return false;
  }

  const current = entry.renderer.getBackground();

  if (
    current?.[0] === background[0] &&
    current?.[1] === background[1] &&
    current?.[2] === background[2]
  ) {
    return false;
  }

  entry.renderer.setBackground(...background);
  return true;
}

/**
 * Debug information about a viewport's WebGPU window (used by examples /
 * debug panels to indicate that the vtk.js WebGPU view API is active).
 */
export function getWebGPUViewportDebugInfo(viewportId: string):
  | {
      viewApi: 'WebGPU';
      initialized: boolean;
      adapter?: string;
    }
  | undefined {
  const entry = windowsByViewportId.get(viewportId);

  if (!entry) {
    return undefined;
  }

  const initialized = entry.view.getInitialized();
  let adapter: string | undefined;

  try {
    const info = entry.view.getDevice()?.getHandle()?.adapterInfo;

    if (info) {
      adapter = [info.vendor, info.architecture, info.description]
        .filter(Boolean)
        .join(' / ');
    }
  } catch {
    adapter = undefined;
  }

  return { viewApi: 'WebGPU', initialized, adapter };
}
