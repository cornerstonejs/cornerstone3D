/**
 *
 * @param page - The page to simulate the drag on
 * @param locator - The locator of the element to perform the drag on
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

  const bbox = await locator.boundingBox();
  const pagePoints = locatorPoints.map((point) => [
    point[0] + bbox.x,
    point[1] + bbox.y,
  ]);

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
