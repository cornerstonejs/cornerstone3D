import { Locator } from 'playwright';

/**
 *
 * @param locator - The locator to click on
 * @param points - The points to click on
 * @param doubleClick - Whether to double click or not
 * @param delayBetweenClicks - The delay between clicks
 * @returns Promise<void>
 */
export const simulateClicksOnElement = async ({
  locator,
  points,
  doubleClick = false,
  delayBetweenClicks = 100,
}: {
  locator: Locator;
  points: { x: number; y: number }[];
  doubleClick?: boolean;
  delayBetweenClicks?: number;
}) => {
  for (const { x, y } of points) {
    await locator.click({
      position: { x, y },
      clickCount: doubleClick ? 2 : 1,
    });
    // await new Promise((resolve) => setTimeout(resolve, delayBetweenClicks));
  }
};
