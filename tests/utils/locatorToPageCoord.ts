import locatorToPageCoords from './locatorToPageCoords';

export default async function locatorToPageCoord(locator, point: number[]) {
  const pagePoints = await locatorToPageCoords(locator, [point]);

  return pagePoints[0];
}
