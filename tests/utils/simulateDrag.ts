/**
 *
 * @param page - The page to simulate the drag on
 * @param locator - The locator of the element to perform the drag on
 */

export const simulateDrag = async (page, locator) => {
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
  // Move to the end point in discrete steps so the gesture is delivered as a
  // continuous stream of mousemove events. A single jump to the end point is
  // unreliable across environments: the lone move can be coalesced/dropped, so
  // the tool records a near-zero drag (e.g. a ~0.5mm length instead of the
  // intended ~138mm, or an unchanged window level) and the snapshot diverges.
  // Stepping makes the drag deterministic. Matches zoomOffCenter elsewhere.
  await page.mouse.move(newX, newY, { steps: 10 });
  await page.mouse.up();
  // Let the tool commit the annotation / property change before the snapshot.
  await page.waitForTimeout(100);
};
