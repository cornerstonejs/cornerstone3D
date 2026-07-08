import { test, expect } from 'playwright-test-coverage';
import type { Locator, Page } from '@playwright/test';
import { visitExample, waitForRenderSettled } from './utils/index';

// The volume + contour viewport in the segmentLabel example seeds Segment 1 and
// Segment 2 several (non-adjacent) slices apart. The SegmentLabelTool must only
// report the segment on the currently displayed slice under the cursor.
// Previously the contour hit-test projected to 2D and ignored the slice (normal)
// axis, so a contour on another slice would match and its name would leak onto
// empty space of the current slice.

const VIEWPORT_UID = 'viewport4';
const SEGMENTATION_ID = 'SEGMENTATION_CONTOUR_VOLUME';

// Matches the mock seeding offset in the example (canvas-pixel offset from the
// viewport center). Segment 2 lives 150px above the center on its own slice.
const SEGMENT_2_OFFSET = { x: 0, y: -150 };

// Number of slices between Segment 1 and Segment 2. Must match
// SEGMENT_SLICE_SEPARATION in packages/tools/examples/segmentLabel/index.ts so
// that scrolling by this amount lands exactly on Segment 2's slice.
const SEGMENT_SLICE_SEPARATION = 10;

const labelLocator = (page: Page) =>
  page.locator(
    `#svg-layer-${VIEWPORT_UID} [data-annotation-uid="segmentSelectLabelAnnotation"]`
  );

/**
 * Hover twice (slightly different points) so Cornerstone registers a real
 * mouse-move delta and the SegmentLabelTool's hover timer fires.
 */
async function hoverAt(
  viewport: Locator,
  position: { x: number; y: number }
): Promise<void> {
  await viewport.hover({
    position: {
      x: Math.max(position.x - 6, 0),
      y: Math.max(position.y - 6, 0),
    },
  });
  await viewport.hover({ position });
  // SegmentLabelTool default hoverTimeout is 100ms; give it room plus a render.
  await viewport.page().waitForTimeout(700);
}

async function getHoverPositions(viewport: Locator, page: Page) {
  const bbox = await viewport.boundingBox();
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);

  if (!bbox) {
    throw new Error(`Viewport ${VIEWPORT_UID} is not visible`);
  }

  const positions = {
    // Center of the viewport, where Segment 1 sits on the current slice.
    segment1: { x: bbox.width / 2, y: bbox.height / 2 },
    // Where Segment 2 (on the adjacent slice) projects - empty on this slice.
    segment2Projection: {
      x: bbox.width / 2 + SEGMENT_2_OFFSET.x / dpr,
      y: bbox.height / 2 + SEGMENT_2_OFFSET.y / dpr,
    },
  };

  for (const [name, position] of Object.entries(positions)) {
    if (
      position.x < 0 ||
      position.x > bbox.width ||
      position.y < 0 ||
      position.y > bbox.height
    ) {
      throw new Error(`${name} hover position is outside ${VIEWPORT_UID}`);
    }
  }

  return positions;
}

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'segmentLabel');

  // The example seeds contours asynchronously (after the volume loads and a
  // slice scroll). Waiting for both segments to have contour annotations is a
  // reliable signal that the viewport is set up and seeding has completed.
  await page.waitForFunction(
    (segmentationId) => {
      const cst = (window as unknown as { cornerstoneTools?: any })
        .cornerstoneTools;
      const segmentation =
        cst?.segmentation?.state?.getSegmentation?.(segmentationId);
      const map = segmentation?.representationData?.Contour?.annotationUIDsMap;
      return Boolean(map?.get(1)?.size && map?.get(2)?.size);
    },
    SEGMENTATION_ID,
    { timeout: 90000 }
  );

  await waitForRenderSettled(page);
});

test.describe('Segment Label Tool - hover is scoped to the current slice', () => {
  test('shows the segment name when hovering it on its own slice', async ({
    page,
  }) => {
    const viewport = page.locator(`[data-viewport-uid="${VIEWPORT_UID}"]`);
    const { segment1 } = await getHoverPositions(viewport, page);

    await hoverAt(viewport, segment1);

    await expect(labelLocator(page)).toContainText('Segment 1');
  });

  test('does NOT show a segment name from another slice on empty space', async ({
    page,
  }) => {
    const viewport = page.locator(`[data-viewport-uid="${VIEWPORT_UID}"]`);
    await viewport.scrollIntoViewIfNeeded();
    const { segment2Projection } = await getHoverPositions(viewport, page);

    // Hovering empty space on Segment 1's slice, where Segment 2 (several slices
    // away) would project. No label must be drawn.
    await hoverAt(viewport, segment2Projection);
    await expect(labelLocator(page)).toHaveCount(0);

    // Sanity check that the hover machinery and the label itself work: scroll to
    // Segment 2's slice and hover the same spot - now the name must appear.
    await page.evaluate(
      ({ viewportId, separation }) => {
        const cornerstone = (window as unknown as { cornerstone?: any })
          .cornerstone;
        const viewport = cornerstone
          ?.getRenderingEngines?.()
          ?.flatMap((engine) => engine.getViewports())
          ?.find((candidate) => candidate.id === viewportId);
        viewport?.scroll(separation);
        viewport?.render();
      },
      { viewportId: VIEWPORT_UID, separation: SEGMENT_SLICE_SEPARATION }
    );

    await waitForRenderSettled(page);

    await hoverAt(viewport, segment2Projection);
    await expect(labelLocator(page)).toContainText('Segment 2');
  });
});
