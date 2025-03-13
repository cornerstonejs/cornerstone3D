import type { Page, Locator } from '@playwright/test';
import locatorToPageCoord from '../../utils/locatorToPageCoord';
import pause from '../../utils/pause';
import { simulateDrawPath } from '../../utils/index';

export async function runPaintFill(
  page: Page,
  canvas: Locator,
  clickPoint: number[]
) {
  const pageCoord = await locatorToPageCoord(canvas, clickPoint);
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('PaintFill');

  await page.mouse.move(pageCoord[0], pageCoord[1]);
  await page.mouse.down();
  await pause(500); // Should wait for >300ms
  await page.mouse.up();

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}

export async function eraseVerticalLine(page: Page, canvas: Locator) {
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('CircularEraser');

  const width = Number(await canvas.getAttribute('width'));
  const height = Number(await canvas.getAttribute('height'));

  // Draws a centered vertical line that crosses the two circular segments
  const startPoint = [Math.round(width / 2), 3 * Math.round(height / 8)];
  const endPoint = [Math.round(width / 2), 5 * Math.round(height / 8)];

  await simulateDrawPath(page, canvas, [startPoint, endPoint], {
    interpolateSteps: true,
  });

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}

export async function drawCircleScissor(page: Page, canvas: Locator) {
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('CircleScissor');

  const width = Number(await canvas.getAttribute('width'));
  const height = Number(await canvas.getAttribute('height'));
  const circleCenterPoint = [Math.round(width / 2), Math.round(height / 3)];
  const circleBorderPoint = [circleCenterPoint[0] + 60, circleCenterPoint[1]];
  const circlePoints = [circleCenterPoint, circleBorderPoint];

  await simulateDrawPath(page, canvas, circlePoints);

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}

export async function drawRectangleScissor(page: Page, canvas: Locator) {
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('RectangleScissor');

  const width = Number(await canvas.getAttribute('width'));
  const height = Number(await canvas.getAttribute('height'));
  const rectTopLeftPoint = [Math.round(width / 3), Math.round(height / 3)];
  const rectBottomRightPoint = [
    2 * Math.round(width / 3),
    Math.round(height / 2),
  ];
  const rectPoints = [rectTopLeftPoint, rectBottomRightPoint];

  await simulateDrawPath(page, canvas, rectPoints);

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}
