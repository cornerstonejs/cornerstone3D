import { expect, test, type Page } from '@playwright/test';

const EXAMPLE = 'nextStackAPI';
const RENDERING_ENGINE_ID = 'myRenderingEngine';
const VIEWPORT_ID = 'CT_STACK_NEXT';
const STACK_DATA_ID = 'stack-api-next:primary';

type ReferenceJson = {
  FrameOfReferenceUID?: string;
  cameraFocalPoint?: number[];
  dataId?: string;
  planeRestriction?: {
    FrameOfReferenceUID: string;
    point: number[];
    inPlaneVector1?: number[];
    inPlaneVector2?: number[];
  };
  referencedImageId?: string;
  referencedImageURI?: string;
  sliceIndex?: number;
  viewPlaneNormal?: number[];
  viewUp?: number[];
};

type ReferenceCompatibilityJson = {
  afterApply: {
    strictImage: boolean;
    targetSliceIndex: number;
  };
  checks: {
    badDataIdNavigation: boolean;
    badFrameOfReferenceNavigation: boolean;
    dataIdOnlyStrict: boolean;
    forOnlyStrict: boolean;
    fullNavigation: boolean;
    fullStrict: boolean;
    imageNavigation: boolean;
    imageStrict: boolean;
    planeNavigation: boolean;
    planeStrict: boolean;
  };
  references: {
    full: ReferenceJson;
    image: ReferenceJson;
    plane: ReferenceJson;
  };
  serializedJson: string;
  referenceSliceIndex: number;
  viewportSliceIndexBeforeApply: number;
};

test.beforeEach(async ({ page }) => {
  await page.goto(`http://localhost:3333/${EXAMPLE}.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#cornerstone-element canvas:visible', {
    state: 'visible',
    timeout: 30000,
  });
  await page.waitForFunction(
    ({ renderingEngineId, viewportId }) => {
      const cornerstone = (
        window as unknown as {
          cornerstone?: {
            getRenderingEngine?: (id: string) => {
              getViewport?: (id: string) => {
                getCurrentImageId?: () => string | undefined;
              };
            };
          };
        }
      ).cornerstone;
      const renderingEngine =
        cornerstone?.getRenderingEngine?.(renderingEngineId);
      const viewport = renderingEngine?.getViewport?.(viewportId);

      return Boolean(viewport?.getCurrentImageId?.());
    },
    { renderingEngineId: RENDERING_ENGINE_ID, viewportId: VIEWPORT_ID }
  );
});

test('reports ViewportNext view reference compatibility as JSON', async ({
  page,
}) => {
  const result = await getReferenceCompatibilityJson(page);
  const parsedJson = JSON.parse(result.serializedJson);

  expect(parsedJson).toEqual({
    checks: result.checks,
    references: result.references,
  });

  expect(result.references.full).toMatchObject({
    FrameOfReferenceUID: expect.any(String),
    dataId: STACK_DATA_ID,
    referencedImageId: expect.any(String),
    referencedImageURI: expect.any(String),
    sliceIndex: 2,
  });
  expect(result.references.image).toEqual({
    FrameOfReferenceUID: result.references.full.FrameOfReferenceUID,
    dataId: STACK_DATA_ID,
    referencedImageId: result.references.full.referencedImageId,
    referencedImageURI: result.references.full.referencedImageURI,
    sliceIndex: 2,
  });
  expect(result.references.plane).toMatchObject({
    FrameOfReferenceUID: result.references.full.FrameOfReferenceUID,
    dataId: STACK_DATA_ID,
    planeRestriction: {
      FrameOfReferenceUID: result.references.full.FrameOfReferenceUID,
      point: expect.any(Array),
    },
    sliceIndex: 2,
  });

  expect(result.referenceSliceIndex).toBe(2);
  expect(result.viewportSliceIndexBeforeApply).toBe(0);
  expect(result.checks).toEqual({
    badDataIdNavigation: false,
    badFrameOfReferenceNavigation: false,
    dataIdOnlyStrict: true,
    forOnlyStrict: true,
    fullNavigation: true,
    fullStrict: false,
    imageNavigation: true,
    imageStrict: false,
    planeNavigation: true,
    planeStrict: false,
  });
  expect(result.afterApply).toEqual({
    strictImage: true,
    targetSliceIndex: 2,
  });
});

async function getReferenceCompatibilityJson(
  page: Page
): Promise<ReferenceCompatibilityJson> {
  return page.evaluate(
    async ({ renderingEngineId, viewportId, stackDataId }) => {
      type BrowserViewport = {
        getCurrentImageIdIndex(): number;
        getMaxImageIdIndex(): number;
        getViewReference(specifier?: { sliceIndex?: number }): ReferenceJson;
        isReferenceViewable(
          reference: ReferenceJson,
          options?: { withNavigation?: boolean; withOrientation?: boolean }
        ): boolean;
        render(): void;
        setImageIdIndex(imageIdIndex: number): Promise<string>;
        setViewReference(reference: ReferenceJson): void;
      };
      type BrowserRenderingEngine = {
        getViewport(viewportId: string): BrowserViewport | undefined;
      };
      type BrowserCornerstone = {
        getRenderingEngine(id: string): BrowserRenderingEngine | undefined;
      };

      const cornerstone = (
        window as unknown as { cornerstone?: BrowserCornerstone }
      ).cornerstone;
      const renderingEngine =
        cornerstone?.getRenderingEngine?.(renderingEngineId);
      const viewport = renderingEngine?.getViewport(viewportId);

      if (!cornerstone || !renderingEngine || !viewport) {
        throw new Error('Missing ViewportNext test harness runtime');
      }

      await viewport.setImageIdIndex(0);
      viewport.render();

      const referenceSliceIndex = Math.min(2, viewport.getMaxImageIdIndex());
      const fullReference = cloneReference(
        viewport.getViewReference({
          sliceIndex: referenceSliceIndex,
        })
      );
      const imageReference: ReferenceJson = {
        FrameOfReferenceUID: fullReference.FrameOfReferenceUID,
        dataId: fullReference.dataId,
        referencedImageId: fullReference.referencedImageId,
        referencedImageURI: fullReference.referencedImageURI,
        sliceIndex: fullReference.sliceIndex,
      };
      const planeReference: ReferenceJson = {
        FrameOfReferenceUID: fullReference.FrameOfReferenceUID,
        dataId: fullReference.dataId,
        planeRestriction: fullReference.planeRestriction
          ? cloneReference(fullReference.planeRestriction)
          : undefined,
        sliceIndex: fullReference.sliceIndex,
      };
      const dataIdReference: ReferenceJson = {
        FrameOfReferenceUID: fullReference.FrameOfReferenceUID,
        dataId: fullReference.dataId,
      };
      const frameOfReferenceOnly: ReferenceJson = {
        FrameOfReferenceUID: fullReference.FrameOfReferenceUID,
      };
      const badDataIdReference: ReferenceJson = {
        ...fullReference,
        dataId: `${stackDataId}:missing`,
      };
      const badFrameOfReference: ReferenceJson = {
        ...fullReference,
        FrameOfReferenceUID: `${fullReference.FrameOfReferenceUID}:mismatch`,
        planeRestriction: fullReference.planeRestriction
          ? {
              ...fullReference.planeRestriction,
              FrameOfReferenceUID: `${fullReference.FrameOfReferenceUID}:mismatch`,
            }
          : undefined,
      };
      const viewportSliceIndexBeforeApply = viewport.getCurrentImageIdIndex();
      const checks = {
        badDataIdNavigation: viewport.isReferenceViewable(badDataIdReference, {
          withNavigation: true,
        }),
        badFrameOfReferenceNavigation: viewport.isReferenceViewable(
          badFrameOfReference,
          { withNavigation: true, withOrientation: true }
        ),
        dataIdOnlyStrict: viewport.isReferenceViewable(dataIdReference),
        forOnlyStrict: viewport.isReferenceViewable(frameOfReferenceOnly),
        fullNavigation: viewport.isReferenceViewable(fullReference, {
          withNavigation: true,
        }),
        fullStrict: viewport.isReferenceViewable(fullReference),
        imageNavigation: viewport.isReferenceViewable(imageReference, {
          withNavigation: true,
        }),
        imageStrict: viewport.isReferenceViewable(imageReference),
        planeNavigation: viewport.isReferenceViewable(planeReference, {
          withNavigation: true,
        }),
        planeStrict: viewport.isReferenceViewable(planeReference),
      };

      viewport.setViewReference(imageReference);
      viewport.render();
      await waitUntil(
        () => viewport.getCurrentImageIdIndex() === referenceSliceIndex
      );
      viewport.render();

      const references = {
        full: fullReference,
        image: imageReference,
        plane: planeReference,
      };

      return {
        afterApply: {
          strictImage: viewport.isReferenceViewable(imageReference),
          targetSliceIndex: viewport.getCurrentImageIdIndex(),
        },
        checks,
        references,
        serializedJson: JSON.stringify({ checks, references }),
        referenceSliceIndex,
        viewportSliceIndexBeforeApply,
      };

      function cloneReference<T>(value: T): T {
        return toPlainJson(value) as T;
      }

      function toPlainJson(value: unknown): unknown {
        if (value === null || typeof value === 'undefined') {
          return value;
        }

        if (typeof value === 'number') {
          return Object.is(value, -0) ? 0 : value;
        }

        if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
          return Array.from(value as ArrayLike<number>, (entry) =>
            toPlainJson(entry)
          );
        }

        if (Array.isArray(value)) {
          return value.map((entry) => toPlainJson(entry));
        }

        if (typeof value === 'object') {
          const output: Record<string, unknown> = {};

          for (const [key, entry] of Object.entries(value)) {
            if (typeof entry !== 'undefined') {
              output[key] = toPlainJson(entry);
            }
          }

          return output;
        }

        return value;
      }

      async function waitUntil(predicate: () => boolean): Promise<void> {
        for (let i = 0; i < 40; i++) {
          if (predicate()) {
            return;
          }

          await new Promise((resolve) => window.setTimeout(resolve, 25));
        }

        throw new Error('Timed out waiting for view reference navigation');
      }
    },
    {
      renderingEngineId: RENDERING_ENGINE_ID,
      viewportId: VIEWPORT_ID,
      stackDataId: STACK_DATA_ID,
    }
  );
}
