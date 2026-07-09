// Shared GenericViewport (PLANAR_NEXT) test-harness setup, generalizing the
// setup flow proven in tests/vitest-browser/genericStackApi.browser.test.ts
// to all four planar render modes.

import {
  cache,
  cornerstoneStreamingImageVolumeLoader,
  Enums,
  getConfiguration,
  getRenderingEngine,
  imageLoader as csImageLoader,
  init,
  RenderingEngine,
  utilities,
  volumeLoader,
  type PlanarViewport,
} from '@cornerstonejs/core';
import {
  registerFakeImageStack,
  type FakeStackOptions,
} from './fakeImageStack';

const { Events, OrientationAxis, RenderBackend, ViewportType } = Enums;

export type PlanarRenderMode =
  | 'vtkImage'
  | 'vtkVolumeSlice'
  | 'cpuImage'
  | 'cpuVolume';

export interface CreatePlanarViewportOptions {
  renderMode?: PlanarRenderMode;
  orientation?: Enums.OrientationAxis;
  width?: number;
  height?: number;
  stack?: FakeStackOptions;
  viewportId?: string;
  renderingEngineId?: string;
  displaySetId?: string;
  /**
   * When true, enable the element but do not register/set display sets. For
   * lifecycle tests that need an enabled-but-empty viewport.
   */
  skipDisplaySets?: boolean;
}

export interface PlanarViewportContext {
  viewport: PlanarViewport;
  element: HTMLDivElement;
  renderingEngine: RenderingEngine;
  imageIds: string[];
  displaySetId: string;
  viewportId: string;
  /** Idempotent: safe to call more than once. */
  cleanup(): void;
}

// Volume-backed render modes (vtkVolumeSlice, cpuVolume) build an IImageVolume
// from the stack's imageIds. The built-in cornerstoneStreamingImageVolumeLoader
// already does exactly what is needed here (load each imageId through the
// registered image loader and derive volume props from per-image metadata),
// so it is reused under a dedicated scheme rather than duplicated.
const FAKE_VOLUME_LOADER_SCHEME = 'vitestFakePlanarVolume';
let fakeVolumeLoaderRegistered = false;

function ensureFakeVolumeLoaderRegistered(): void {
  if (fakeVolumeLoaderRegistered) {
    return;
  }

  // registerVolumeLoader is a plain scheme->fn assignment; there is no
  // unregister API and nothing in this harness ever removes it, so a
  // one-time guard is safe (unlike the image-loader scheme, nothing calls an
  // equivalent of unregisterAllVolumeLoaders()).
  volumeLoader.registerVolumeLoader(
    FAKE_VOLUME_LOADER_SCHEME,
    cornerstoneStreamingImageVolumeLoader as unknown as Parameters<
      typeof volumeLoader.registerVolumeLoader
    >[1]
  );
  fakeVolumeLoaderRegistered = true;
}

let harnessInstanceCounter = 0;

function nextId(prefix: string): string {
  harnessInstanceCounter += 1;
  return `${prefix}-${harnessInstanceCounter}-${utilities.uuidv4()}`;
}

/**
 * Attaches a once IMAGE_RENDERED listener BEFORE calling render(), resolving
 * on the event. Mirrors the reference test's waitForImageRendered helper.
 */
export function renderAndWait(
  element: HTMLElement,
  viewport: { render(): void }
): Promise<void> {
  return new Promise<void>((resolve) => {
    element.addEventListener(Events.IMAGE_RENDERED, () => resolve(), {
      once: true,
    });
    viewport.render();
  });
}

export async function createPlanarViewport(
  opts: CreatePlanarViewportOptions = {}
): Promise<PlanarViewportContext> {
  const renderMode = opts.renderMode ?? 'vtkImage';
  const orientation = opts.orientation ?? OrientationAxis.AXIAL;
  const width = opts.width ?? 400;
  const height = opts.height ?? 400;
  const viewportId = opts.viewportId ?? nextId('vitest-planar-viewport');
  const renderingEngineId =
    opts.renderingEngineId ?? nextId('vitest-planar-engine');
  const displaySetId = opts.displaySetId ?? nextId('vitest-planar-displayset');
  const skipDisplaySets = opts.skipDisplaySets ?? false;

  init();

  const renderingConfig = getConfiguration().rendering;
  const previousUseGenericViewport = renderingConfig.useGenericViewport;
  renderingConfig.useGenericViewport = true;

  const isVolumeBacked =
    renderMode === 'vtkVolumeSlice' || renderMode === 'cpuVolume';
  const isCpu = renderMode === 'cpuImage' || renderMode === 'cpuVolume';

  if (isVolumeBacked) {
    ensureFakeVolumeLoaderRegistered();
  }

  const fakeStack = registerFakeImageStack(opts.stack);
  const { imageIds } = fakeStack;

  const renderingEngine = new RenderingEngine(renderingEngineId);
  const element = document.createElement('div');
  element.dataset.testid = 'planar-harness-viewport';
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      orientation,
    },
  });

  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    const engine = getRenderingEngine(renderingEngineId);
    engine?.destroy();
    cache.purgeCache();
    fakeStack.unregister();
    csImageLoader.unregisterAllImageLoaders();
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();

    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }

    if (previousUseGenericViewport !== undefined) {
      getConfiguration().rendering.useGenericViewport =
        previousUseGenericViewport;
    }
  };

  if (skipDisplaySets) {
    return {
      viewport,
      element,
      renderingEngine,
      imageIds,
      displaySetId,
      viewportId,
      cleanup,
    };
  }

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
    ...(isVolumeBacked
      ? { volumeId: `${FAKE_VOLUME_LOADER_SCHEME}:${displaySetId}` }
      : {}),
  });

  try {
    await viewport.setDisplaySets({
      displaySetId,
      options: {
        orientation,
        renderBackend: isCpu ? RenderBackend.CPU : RenderBackend.GPU,
      },
    });
  } catch (error) {
    cleanup();
    throw error;
  }

  await renderAndWait(element, viewport);

  return {
    viewport,
    element,
    renderingEngine,
    imageIds,
    displaySetId,
    viewportId,
    cleanup,
  };
}
