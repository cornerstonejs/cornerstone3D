/**
 *
 * @param page - The page to simulate the drag on
 * @param locator - The locator of the element to perform the drag on
 * @param options.steps - When set, deliver the move to the end point as this
 *   many intermediate mousemove events instead of a single jump. Use for tools
 *   that need a continuous gesture to register reliably (length annotation,
 *   window-level). Leave unset for path-integrating tools (e.g. planar-rotate)
 *   whose result depends on the motion path — stepping would change their
 *   outcome.
 */
export const simulateDrag = async (page, locator, { steps }: { steps?: number } = {}) => {
  // Mirror the genericViewport drawLengthMeasurement helper, which draws
  // reliably on the self-hosted runner: scroll the target into view so its
  // boundingBox (and therefore the mouse coordinates) is accurate, and let the
  // tool/render settle after the gesture. Without the scroll the legacy
  // examples' layout can leave the canvas boundingBox stale, so the drag lands
  // off-target and the tool records a near-zero gesture (e.g. a ~0.5mm length
  // instead of ~138mm, or an unchanged window level).
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element is not visible');
  }
  const { x, y, width, height } = box;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Calculate the maximum possible movement distances within the element's bounds
  const maxMoveX = Math.min(100, x + width - centerX);
  const maxMoveY = Math.min(100, y + height - centerY);

  const newX = centerX + maxMoveX;
  const newY = centerY + maxMoveY;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  // Let the tool enter its drawing/active state from the mousedown before the
  // move. On the self-hosted runner the down->move->up can otherwise fire faster
  // than the annotation tool finishes setting up its move handler, so the move
  // is missed and the gesture is recorded as near-zero (a ~0.5mm length instead
  // of ~138mm).
  await page.waitForTimeout(100);
  await page.mouse.move(newX, newY, steps ? { steps } : undefined);
  await page.mouse.up();
  // Let the tool commit the annotation / property change and the viewport
  // re-render before the snapshot is captured.
  await page.waitForTimeout(500);
};
