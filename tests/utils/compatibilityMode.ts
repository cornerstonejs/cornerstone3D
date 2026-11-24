import { expect, type Page } from '@playwright/test';

function shouldForceCpuRendering(): boolean {
  return process.env.PLAYWRIGHT_FORCE_CPU_RENDERING === 'true';
}

export function isCompatibilityMode(): boolean {
  return shouldForceCpuRendering();
}

/**
 * The reason of the dynamic threshold pictures that fail under `--cpu` on
 * purpose: on the CPU the brush fills a stroke in one call at mouse up with
 * the range of the whole stroke, where the GPU fills each step with the range
 * reached at that step and leaves holes, so the CPU fills more (16,004 pixels
 * against 15,323 for the stroke of the spec).
 */
export const CPU_DYNAMIC_THRESHOLD_STROKE_ISSUE =
  'Open issue 71: the CPU fills a dynamic threshold stroke at once with the range of the whole stroke, so it fills the holes that the GPU stroke leaves';

const pagesWatchedForErrors = new WeakSet<Page>();

/**
 * Under `--cpu`, makes the running test fail on every uncaught error of the
 * page. An error of the CPU path can leave a picture without a layer and
 * nothing else, so a page error is a failure of its own. A page is watched
 * once, however often an example is visited on it.
 */
export function failOnPageErrors(page: Page, title?: string): void {
  if (!isCompatibilityMode() || pagesWatchedForErrors.has(page)) {
    return;
  }

  pagesWatchedForErrors.add(page);
  page.on('pageerror', (error) => {
    expect
      .soft(
        `${error.name}: ${error.message}`,
        `${title ?? 'example'} should run without a page error under --cpu`
      )
      .toBeUndefined();
  });
}

/**
 * Under `--cpu`, checks that every layer of the render plan of every planar
 * viewport of the page draws on the CPU. The runtime check proves the pin of
 * the backend; this proves that each layer took it. A viewport without a
 * render plan (3D, video) is not planar and is not checked.
 */
export async function expectPlanarLayersDrawOnCpu(
  page: Page,
  title?: string
): Promise<void> {
  if (!isCompatibilityMode()) {
    return;
  }

  const layersNotOnCpu = await page.evaluate(() => {
    type RenderPlanLayer = { displaySetId: string; draw: string; reason: string };
    type PlanViewport = {
      id: string;
      getRenderPlan?: () => RenderPlanLayer[];
    };
    const cornerstone = (
      window as typeof window & {
        cornerstone?: {
          getRenderingEngines?: () => { getViewports(): PlanViewport[] }[];
        };
      }
    ).cornerstone;
    const viewports = (cornerstone?.getRenderingEngines?.() ?? []).flatMap(
      (renderingEngine) => renderingEngine.getViewports()
    );

    return viewports.flatMap((viewport) =>
      (viewport.getRenderPlan?.() ?? [])
        .filter((layer) => layer.draw !== 'cpu')
        .map(
          (layer) =>
            `${viewport.id}/${layer.displaySetId}: ${layer.draw} (${layer.reason})`
        )
    );
  });

  expect(
    layersNotOnCpu,
    `${title ?? 'example'} should draw every planar layer on the CPU`
  ).toEqual([]);
}

export async function validateCompatibilityRuntime(
  page: Page,
  title?: string
): Promise<void> {
  if (!isCompatibilityMode()) {
    return;
  }

  const runtime = await page.evaluate(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const cornerstone = (window as typeof window & {
      cornerstone?: {
        getRenderBackend?: () => string;
        getEffectiveRenderBackend?: () => string;
      };
    }).cornerstone;

    return {
      url: window.location.href,
      cpuParam: searchParams.get('cpu'),
      renderBackend: cornerstone?.getRenderBackend?.(),
      effectiveRenderBackend: cornerstone?.getEffectiveRenderBackend?.(),
    };
  });

  if (shouldForceCpuRendering()) {
    expect(
      runtime.cpuParam,
      `${title ?? 'example'} should be opened with ?cpu=1`
    ).toBe('1');
    expect(
      runtime.renderBackend,
      `${title ?? 'example'} should pin the cpu render backend`
    ).toBe('cpu');
    expect(
      runtime.effectiveRenderBackend,
      `${title ?? 'example'} should resolve the cpu render backend`
    ).toBe('cpu');
  }
}
