/**
 *
 * @param page - The page to simulate the drag on
 * @param locator - The locator of the element to perform the drag on
 * @param options.steps - When set, deliver the move to the end point as this
 *   many intermediate mousemove events instead of a single jump. This is the
 *   single reliability mechanism for the gesture: a continuous stream of moves
 *   registers every time on the self-hosted runner, where a lone move can be
 *   dropped and the tool records a near-zero gesture (a ~0.5mm length instead of
 *   ~138mm, or an unchanged window level). Use it for length/window-level. Leave
 *   unset for path-integrating tools (planar-rotate) whose result depends on the
 *   motion path, where a single move is required.
 */
export const simulateDrag = async (
  page,
  locator,
  { steps }: { steps?: number } = {}
) => {
  // Scroll the target into view so its boundingBox (and therefore the mouse
  // coordinates) is accurate; the legacy examples' layout can otherwise leave a
  // stale boundingBox so the drag lands off-target.
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
  // Let the tool's mousedown handler create the annotation and attach its
  // active-drag move handler before we start moving. On the self-hosted runner,
  // moving in the same burst as the mousedown can be dropped entirely.
  await page.waitForTimeout(50);

  if (steps && steps > 1) {
    // Deliver the gesture as discrete, individually-flushed mousemoves with a
    // brief settle between them. A single batched move - even Playwright's
    // built-in `{ steps }` - can be coalesced/dropped on the self-hosted runner,
    // leaving the tool with a near-zero gesture (a ~0.5mm length instead of
    // ~138mm). Pacing the moves makes each one register while keeping the same
    // end point, so screenshot baselines still match.
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(centerX + maxMoveX * t, centerY + maxMoveY * t);
      await page.waitForTimeout(10);
    }
  } else {
    // Path-integrating tools (e.g. planar-rotate) depend on a single move.
    await page.mouse.move(newX, newY);
  }

  await page.mouse.up();
  // Let the tool commit the annotation / property change and the viewport
  // re-render before the snapshot is captured.
  await page.waitForTimeout(500);
};
