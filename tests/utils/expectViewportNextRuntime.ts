import { expect, type Page } from '@playwright/test';

type RuntimeExpectation = {
  renderingEngineId: string;
  viewportId: string;
  constructorName: string;
  type: string;
  renderModesByDataId: Record<string, string>;
};

export async function expectViewportNextRuntime(
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
              getDataRenderMode?: (dataId: string) => string | undefined;
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
          renderModesByDataId: {},
          error: 'viewport-not-found',
        };
      }

      const renderModesByDataId = Object.fromEntries(
        Object.keys(item.renderModesByDataId).map((dataId) => [
          dataId,
          viewport.getDataRenderMode?.(dataId),
        ])
      );

      return {
        viewportId: item.viewportId,
        constructorName: viewport.constructor?.name,
        type: viewport.type,
        renderModesByDataId,
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
      result.renderModesByDataId,
      `${expected.viewportId} render modes`
    ).toEqual(expected.renderModesByDataId);
  });
}
