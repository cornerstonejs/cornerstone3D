/**
 * Modifies the SVG element in place by setting the attributes used to track
 * the unique element and its associations
 *
 * @param svgElement
 */
function _getHashFromSvgElement(
  svgElement: SVGElement,
  toolUID: string,
  annotationUID: string,
  drawingElementType: string,
  nodeUID: string
): void {
  svgElement.setAttribute('data-tool-uid', toolUID)
  svgElement.setAttribute('data-annotation-uid', annotationUID)
  svgElement.setAttribute('data-drawing-element-type', drawingElementType)
  svgElement.setAttribute('data-node-uid', nodeUID)
}

export default _getHashFromSvgElement
