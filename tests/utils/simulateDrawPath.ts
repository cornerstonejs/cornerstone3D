import locatorToPageCoords from './locatorToPageCoords';

/**
 *
 * @param page - The page to simulate the drag on
 * @param locator - The locator of the element to perform the drag on
 * @param locatorPoints - Array with at least two points
 * @param options - Options object that may contain one or more of the following options
 *   - button: button that should be used to trigger mouse down/up events
 *   - steps: number of steps between each pair of points
 *   - closePath: it closes the path moving the mouse back to the start point
 *     when this is set to true
 *   - interpolateSteps: interpolates the mouse movement by `steps` steps or by
 *     the distance multiplied by `stepsResolution` steps.
 *   - stepsResolution: determines how many steps will be used when `interpolateSteps`
 *     is set to `true` but `steps` is `undefined`. The number of steps will be
 *     equal to the distance between the two points when `stepsResolution` is set
 *     to 1 but that may make the test run very slow. Default: 1/4.
 */
async function simulateDrawPath(
  page,
  locator,
  locatorPoints,
  options?: {
    button?: 'left' | 'right' | 'middle';
    steps?: number;
    closePath?: boolean;
    interpolateSteps?: boolean;
    stepsResolution?: number;
  }
) {
  if (locatorPoints.length < 2) {
    throw new Error('locatorPoints must have at least two points');
  }

  const pagePoints = await locatorToPageCoords(locator, locatorPoints);

  if (options?.closePath) {
    pagePoints.push(pagePoints[0]);
  }

  // Using 1/4 by deafult to avoid moving 1px at a time which would be too slow
  const stepsResolution = options?.stepsResolution ?? 1 / 4;

  const button = options?.button ?? 'left';
  const startPoint = pagePoints[0];

  await page.mouse.move(startPoint[0], startPoint[1]);
  await page.mouse.down({ button });

  let previousPoint = startPoint;

  for (let i = 1, len = pagePoints.length; i < len; i++) {
    const currentPoint = pagePoints[i];
    let steps = options?.steps;

    if (!steps && options?.interpolateSteps) {
      const dx = currentPoint[0] - previousPoint[0];
      const dy = currentPoint[1] - previousPoint[1];

      steps = Math.max(
        1,
        Math.round(Math.sqrt(dx ** 2 + dy ** 2)) * stepsResolution
      );
    }

    await page.mouse.move(currentPoint[0], currentPoint[1], { steps });
    previousPoint = currentPoint;
  }

  await page.mouse.up({ button });
}

export { simulateDrawPath as default, simulateDrawPath };
