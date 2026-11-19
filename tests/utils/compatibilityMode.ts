import { expect, type Page } from '@playwright/test';

function shouldForceCpuRendering(): boolean {
  return process.env.PLAYWRIGHT_FORCE_CPU_RENDERING === 'true';
}

export function isCompatibilityMode(): boolean {
  return shouldForceCpuRendering();
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
