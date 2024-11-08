export const reduce3DViewportSize = async (page) => {
  await page.evaluate(({ cornerstone }) => {
    const enabledElement = cornerstone
      .getEnabledElements()
      .filter((element) => element.viewport.type === 'volume3d')[0];
    const { viewport } = enabledElement;
    viewport.setZoom(0.25);
    viewport.render();
  }, await page.evaluateHandle('window'));
};
