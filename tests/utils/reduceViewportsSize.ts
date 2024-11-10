/**
 * Uses cornerstone to reduce the viewport size of all viewports to 25%.
 * Useful for heavy tests that use segmentation and 3D rendering.
 * @param page - Playwright page object.
 */

export const reduceViewportsSize = async (page) => {
  await page.evaluate(({ cornerstone }) => {
    const enabledElements = cornerstone.getEnabledElements();

    enabledElements.forEach(({ viewport }) => {
      viewport.setZoom(0.4);
      viewport.render();
    });
  }, await page.evaluateHandle('window'));
};
