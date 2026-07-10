import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkWebGPURenderWindow from '@kitware/vtk.js/Rendering/WebGPU/RenderWindow';
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
        onSubmittedWorkDone(): Promise<void>;
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
 * from the DOM; frames are blitted into the viewport's visible canvas after
 * the device reports the submitted work done.
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
   * Set when the last binding releases the window. Deferred blits (the
   * device work-done promise from the final frame) must bail out instead of
   * touching the deleted vtk objects.
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
  viewportId: string
): WebGPUViewportWindow {
  let entry = windowsByViewportId.get(viewportId);

  if (!entry) {
    const renderWindow = vtkRenderWindow.newInstance();
    const view = vtkWebGPURenderWindow.newInstance() as unknown as WebGPUView;

    renderWindow.addView(
      view as unknown as Parameters<typeof renderWindow.addView>[0]
    );

    const renderer = vtkRenderer.newInstance({ background: [0, 0, 0] });
    renderer.getActiveCamera().setParallelProjection(true);
    renderWindow.addRenderer(renderer);

    entry = { renderWindow, view, renderer, refCount: 0, destroyed: false };
    windowsByViewportId.set(viewportId, entry);
  }

  entry.refCount += 1;
  return entry;
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
 * viewport's visible surface canvas). The first frame is inherently
 * asynchronous — the vtk.js WebGPU view acquires its adapter/device on the
 * initial traverse — so the blit (and `onBlitted`) runs once the device
 * reports the submitted work done.
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

  const finish = () => {
    if (entry.destroyed) {
      return;
    }

    const device = view.getDevice();

    if (!device) {
      return;
    }

    void device.onSubmittedWorkDone().then(() => {
      // The window may have been released while the device work was in
      // flight (e.g. a live render-backend switch tearing this path down);
      // the vtk objects are deleted at that point.
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
    });
  };

  if (view.getInitialized()) {
    finish();
  } else {
    const subscription = view.onInitialized(() => {
      subscription.unsubscribe();
      finish();
    });
  }
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
