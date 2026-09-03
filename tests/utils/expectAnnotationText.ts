import { expect, type Page } from '@playwright/test';

/**
 * Reads the rendered annotation label(s) from the SVG overlay and asserts the
 * text value.
 *
 * Pair this with `checkForCanvasSnapshot(..., { hideAnnotationText: true })`:
 * the label is the single largest source of environment-dependent screenshot
 * diffs (font glyph rasterization shifts ±1 sub-pixel between machines and GL
 * backends), so we verify the *value* explicitly here and keep it out of the
 * pixel comparison. Asserting the value is also a strictly stronger check than
 * the screenshot ever was — a snapshot can't tell "138 mm" from "188 mm", an
 * assertion can.
 *
 * `drawTextBox` is the only place that stamps `data-annotation-uid` on a
 * `<g>`, so that selector targets annotation text boxes exclusively (not lines,
 * handles, link lines, or other SVG primitives).
 *
 * @param page - Playwright page.
 * @param viewportIndex - Index into `[data-viewport-uid]` elements.
 * @param expected - Exact string (trimmed) or RegExp the label must match.
 * @param labelIndex - Which label to read when a viewport has several. Default 0.
 */
export async function expectAnnotationText(
  page: Page,
  viewportIndex: number,
  expected: string | RegExp,
  labelIndex = 0
): Promise<void> {
  const label = page
    .locator('[data-viewport-uid]')
    .nth(viewportIndex)
    .locator('svg.svg-layer g[data-annotation-uid] text')
    .nth(labelIndex);

  await expect(label).toBeVisible();

  // textContent concatenates the <tspan> lines; trim incidental whitespace.
  const text = ((await label.textContent()) ?? '').trim();

  if (typeof expected === 'string') {
    expect(text).toBe(expected);
  } else {
    expect(text).toMatch(expected);
  }
}
