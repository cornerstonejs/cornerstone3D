import getSvgDrawingHelper from './getSvgDrawingHelper';

/**
 * We are not using it anywhere yet.
 * @param element
 * @param toolType
 * @internal
 */
function clearByToolType(element: HTMLDivElement, toolType: string): void {
  const svgDrawingHelper = getSvgDrawingHelper(element);
  const nodes = svgDrawingHelper.svgLayerElement.querySelectorAll(
    'svg > *'
  ) as NodeListOf<SVGElement>;

  // Todo: check variable namings when this function starts to get utilized
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const toolUID = node.dataset.toolUid;

    if (toolUID === toolType) {
      svgDrawingHelper.svgLayerElement.removeChild(node);
    }
  }
}

export default clearByToolType;
