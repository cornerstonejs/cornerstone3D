import { expect, type Page } from '@playwright/test';

function shouldForceGenericViewport(): boolean {
  return process.env.PLAYWRIGHT_FORCE_COMPAT === 'true';
}

function shouldForceCpuRendering(): boolean {
  return process.env.PLAYWRIGHT_FORCE_CPU_RENDERING === 'true';
}

export function isCompatibilityMode(): boolean {
  return shouldForceGenericViewport() || shouldForceCpuRendering();
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
        getShouldUseCPURendering?: () => boolean;
        getUseGenericViewport?: () => boolean;
        getEffectiveRenderBackend?: () => string;
      };
    }).cornerstone;

    return {
      url: window.location.href,
      typeParam: searchParams.get('type'),
      cpuParam: searchParams.get('cpu'),
      useGenericViewport: cornerstone?.getUseGenericViewport?.(),
      useCPURendering: cornerstone?.getShouldUseCPURendering?.(),
      effectiveRenderBackend: cornerstone?.getEffectiveRenderBackend?.(),
    };
  });

  if (shouldForceGenericViewport()) {
    expect(
      runtime.typeParam,
      `${title ?? 'example'} should be opened with ?type=next`
    ).toBe('next');
    expect(
      runtime.useGenericViewport,
      `${title ?? 'example'} should enable GenericViewport compatibility`
    ).toBe(true);
  }

  if (shouldForceCpuRendering()) {
    expect(
      runtime.cpuParam,
      `${title ?? 'example'} should be opened with ?cpu=1`
    ).toBe('1');
    expect(
      runtime.useCPURendering,
      `${title ?? 'example'} should enable CPU rendering`
    ).toBe(true);
    expect(
      runtime.effectiveRenderBackend,
      `${title ?? 'example'} should resolve the cpu render backend`
    ).toBe('cpu');
  }
}
