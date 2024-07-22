/**
 * Convert a point from locator space (eg: canvas) to page space.
 * These points are used frequently by `page.mouse` methods.
 *
 * Do not call `locatorToPageCoord` that converts one point at a time when
 * converting multiple points because `locator.boundingBox()` add an extra ~10ms
 * to each call.
 *
 * @param locator - An element returned by `page.locator()`
 * @param points - Array of poins in locator space to be converted to page space
 * @returns Array of points in page space
 */
export default async function locatorToPageCoords(locator, points: number[][]) {
  const bbox = await locator.boundingBox();

  return points.map((point) => [bbox.x + point[0], bbox.y + point[1]]);
}
