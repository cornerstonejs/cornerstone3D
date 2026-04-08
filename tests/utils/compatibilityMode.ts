import { expect, type Page } from '@playwright/test';

function shouldForceViewportNext(): boolean {
  return process.env.PLAYWRIGHT_FORCE_VIEWPORT_V2 === 'true';
}

function shouldForceCpuRendering(): boolean {
  return process.env.PLAYWRIGHT_FORCE_CPU_RENDERING === 'true';
}

export function isCompatibilityMode(): boolean {
  return shouldForceViewportNext() || shouldForceCpuRendering();
}

function getCompatibilityModePathPrefix(): string | null {
  if (!isCompatibilityMode()) {
    return null;
  }

  const parts = ['compatibility'];

  if (shouldForceViewportNext()) {
    parts.push('viewport-v2');
  }

  if (shouldForceCpuRendering()) {
    parts.push('cpu');
  }

  return parts.join('/');
}

export function resolveCompatibilityScreenshotPath(
  screenshotPath: string
): string {
  const prefix = getCompatibilityModePathPrefix();

  if (!prefix) {
    return screenshotPath;
  }

  return `${prefix}/${screenshotPath}`;
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
        getUseViewportNext?: () => boolean;
      };
    }).cornerstone;

    return {
      url: window.location.href,
      typeParam: searchParams.get('type'),
      cpuParam: searchParams.get('cpu'),
      useViewportNext: cornerstone?.getUseViewportNext?.(),
      useCPURendering: cornerstone?.getShouldUseCPURendering?.(),
    };
  });

  if (shouldForceViewportNext()) {
    expect(
      runtime.typeParam,
      `${title ?? 'example'} should be opened with ?type=next`
    ).toBe('next');
    expect(
      runtime.useViewportNext,
      `${title ?? 'example'} should enable ViewportNext compatibility`
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
  }
}
