export default async function locatorToPageCoord(
  page,
  locator,
  point: number[]
) {
  const bbox = await locator.boundingBox();

  return [bbox.x + point[0], bbox.y + point[1]];
}
