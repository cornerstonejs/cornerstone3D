import { expect, type Page } from '@playwright/test';
import { getForcedSliceFirst } from './createExampleUrl';

type RuntimeExpectation = {
  renderingEngineId: string;
  viewportId: string;
  constructorName: string;
  type: string;
  renderModesByDisplaySetId: Record<string, string>;
};

export async function expectViewportRuntime(
  page: Page,
  expectations: RuntimeExpectation[]
): Promise<void> {
  const results = await page.evaluate((items) => {
    return items.map((item) => {
      const engine = (window as typeof window & {
        cornerstone?: {
          getRenderingEngine?: (id: string) => {
            getViewport?: (viewportId: string) => {
              constructor?: { name?: string };
              type?: string;
              getDisplaySetRenderMode?: (
                displaySetId: string
              ) => string | undefined;
            } | null;
          } | null;
        };
      }).cornerstone?.getRenderingEngine?.(item.renderingEngineId);

      const viewport = engine?.getViewport?.(item.viewportId);

      if (!viewport) {
        return {
          viewportId: item.viewportId,
          constructorName: undefined,
          type: undefined,
          renderModesByDisplaySetId: {},
          error: 'viewport-not-found',
        };
      }

      const renderModesByDisplaySetId = Object.fromEntries(
        Object.keys(item.renderModesByDisplaySetId).map((displaySetId) => [
          displaySetId,
          viewport.getDisplaySetRenderMode?.(displaySetId),
        ])
      );

      return {
        viewportId: item.viewportId,
        constructorName: viewport.constructor?.name,
        type: viewport.type,
        renderModesByDisplaySetId,
      };
    });
  }, expectations);

  results.forEach((result, index) => {
    const expected = expectations[index];

    expect(result.error, `${expected.viewportId} lookup`).toBeUndefined();
    expect(result.constructorName, `${expected.viewportId} constructor`).toBe(
      expected.constructorName
    );
    expect(result.type, `${expected.viewportId} type`).toBe(expected.type);
    expect(
      result.renderModesByDisplaySetId,
      `${expected.viewportId} render modes`
    ).toEqual(expected.renderModesByDisplaySetId);
  });
}

/**
 * The render mode of a plain slice of a scalar volume on a next planar
 * viewport with the GPU backend: `vtkCpuSlice`, since slice first is on by
 * default, and `vtkGpuVolumeSlice` when the run turns slice first off for every
 * example (`PLAYWRIGHT_SLICE_FIRST=0`). A test that is about the 3D texture
 * itself pins its mode.
 */
export function getPlainVolumeSliceRenderMode(): string {
  return getForcedSliceFirst() === false
    ? 'vtkGpuVolumeSlice'
    : 'vtkCpuSlice';
}
