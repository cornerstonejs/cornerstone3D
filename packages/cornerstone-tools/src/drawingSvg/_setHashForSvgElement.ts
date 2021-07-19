/**
 * Modifies the SVG element in place by setting the attributes used to track
 * the unique element and its associations
 *
 * @param svgElement
 */
function _setHashFromSvgElement(
  svgElement: SVGElement,
  toolDataUID: string,
  annotationUID: string,
  drawingElementType: string,
  nodeUID: string
): void {
  svgElement.setAttribute('data-tool-uid', toolDataUID)
  svgElement.setAttribute('data-annotation-uid', annotationUID)
  svgElement.setAttribute('data-drawing-element-type', drawingElementType)
  svgElement.setAttribute('data-node-uid', nodeUID)
}

export default _setHashFromSvgElement
