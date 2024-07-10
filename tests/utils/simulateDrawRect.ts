import locatorToPageCoord from './locatorToPageCoord';
import pause from './pause';

export default async function simulateDrawRect(
  page,
  locator,
  rectTopLeft,
  rectBottomRight
) {
  const pageTopLeftPoint = await locatorToPageCoord(page, locator, rectTopLeft);
  const pageBottomRightPoint = await locatorToPageCoord(
    page,
    locator,
    rectBottomRight
  );

  await page.mouse.move(pageTopLeftPoint[0], pageTopLeftPoint[1]);
  await page.mouse.down();
  await pause(500);
  await page.mouse.move(pageBottomRightPoint[0], pageBottomRightPoint[1]);
  await pause(500);
  await page.mouse.up();
}
