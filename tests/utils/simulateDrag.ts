import type { Page } from '@playwright/test';
import type { GestureVerifier } from './gestureVerifiers';

export interface SimulateDragOptions {
  /**
   * When set, deliver the move to the end point as this many intermediate
   * mousemove events instead of a single jump. Use it for length and
   * window-level. Leave it unset for a path-integrating tool (planar-rotate)
   * whose result depends on the motion path, where a single move is required.
   */
  steps?: number;
  /**
   * What the gesture must achieve. With a verifier, `simulateDrag` waits for
   * the tool to respond to the mousedown instead of sleeping, repairs a
   * dropped move before it releases the button, and throws a named error when
   * the gesture still did not register.
   *
   * Do not pass one for a path-integrating tool: the repair adds moves, and
   * those moves change the path.
   */
  verify?: GestureVerifier;
  /** How long to wait for the tool to respond to the mousedown. */
  startTimeoutMs?: number;
  /** How long to wait, after the button goes up, for the effect to appear. */
  verifyTimeoutMs?: number;
  /** How many times to repair the gesture before giving up. */
  maxRepairs?: number;
}

const POLL_INTERVAL_MS = 25;
/**
 * Kept as a floor even when a verifier reports the start. A tool can attach its
 * move handler slightly after the state the verifier observes, and the first
 * move is the one that gets dropped.
 */
const MOUSEDOWN_FLOOR_MS = 150;

async function pollUntil(
  page: Page,
  condition: () => Promise<boolean>,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
}

/**
 * Drags from the centre of an element towards its bottom-right corner.
 *
 * On the self-hosted runner a mousemove can be coalesced or dropped. The tool
 * then records a near-zero gesture: the length tool reports ~0.5mm instead of
 * ~138mm, and the window-level tool leaves the VOI untouched. A screenshot
 * catches that as a few hundred differing pixels, which reads like a rendering
 * regression and is not one.
 *
 * Pass `verify` to close that gap. The verifier observes the tool, not the
 * pixels, so this function can:
 *
 *   - wait for the tool to respond to the mousedown, rather than sleep;
 *   - notice a dropped move while the button is still down, and repair it;
 *   - fail with the reason when the gesture did not register.
 *
 * The repair happens inside the gesture on purpose. Repeating the whole
 * gesture would leave the first, half-finished annotation on the viewport and
 * add a second one, and for a tool that works in deltas it would apply the
 * movement twice. A move that returns to the same end point costs a
 * delta-based tool nothing and puts an absolute-position tool exactly where it
 * belongs, so a repair cannot change the result of a gesture that already
 * registered.
 *
 * @param page - The page to simulate the drag on
 * @param locator - The locator of the element to perform the drag on
 * @param options - See `SimulateDragOptions`
 */
export const simulateDrag = async (
  page: Page,
  locator,
  {
    steps,
    verify,
    startTimeoutMs = 2000,
    verifyTimeoutMs = 4000,
    maxRepairs = 4,
  }: SimulateDragOptions = {}
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

  await verify?.prepare?.(page);

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();

  // Let the tool's mousedown handler create the annotation and attach its
  // active-drag move handler before the first move. Moving in the same burst as
  // the mousedown can drop the move entirely. A verifier that reports the start
  // turns this from a guess into an observation; without one, the fixed wait
  // remains the only option.
  await page.waitForTimeout(MOUSEDOWN_FLOOR_MS);
  if (verify?.hasStarted) {
    await pollUntil(page, () => verify.hasStarted(page), startTimeoutMs);
  }

  if (steps && steps > 1) {
    // Deliver the gesture as discrete, individually-flushed mousemoves with a
    // settle between them. A single batched move - even Playwright's built-in
    // `{ steps }` - can be coalesced/dropped on the self-hosted runner. Pacing
    // the moves makes each one register while keeping the same end point, so
    // screenshot baselines still match.
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(centerX + maxMoveX * t, centerY + maxMoveY * t);
      await page.waitForTimeout(30);
    }
  } else {
    // Path-integrating tools (e.g. planar-rotate) depend on a single move.
    await page.mouse.move(newX, newY);
  }

  // Repair a dropped move while the button is still down. Cornerstone updates
  // the annotation live during a drag, so the verifier can already answer here.
  if (verify) {
    for (
      let repair = 0;
      repair < maxRepairs && !(await verify.holds(page));
      repair++
    ) {
      // Step away and back, so the tool receives a move with a real delta and
      // then returns to the intended end point.
      await page.mouse.move(newX - 1, newY - 1);
      await page.waitForTimeout(30);
      await page.mouse.move(newX, newY);
      await page.waitForTimeout(60);
    }
  }

  await page.mouse.up();
  // Let the tool commit the annotation / property change and the viewport
  // re-render before the snapshot is captured.
  await page.waitForTimeout(500);

  if (!verify) {
    return;
  }

  if (!(await pollUntil(page, () => verify.holds(page), verifyTimeoutMs))) {
    throw new Error(
      `The drag did not register. Expected ${verify.description}, but the page shows ` +
        `${await verify.describeActual(page)}. The gesture reached the tool ` +
        `incompletely, which on this runner means a dropped or coalesced ` +
        `mousemove rather than a rendering change.`
    );
  }
};
