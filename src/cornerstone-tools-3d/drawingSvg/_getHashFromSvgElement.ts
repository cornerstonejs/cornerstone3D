function _getHashFromSvgElement(svgElement: SVGElement): string {
  const toolUID = svgElement.dataset.toolUid
  const annotationUID = svgElement.dataset.annotationUid
  const drawingElementType = svgElement.dataset.drawingElementType
  const nodeUID = svgElement.dataset.nodeUid

  return `${toolUID}::${annotationUID}::${drawingElementType}::${nodeUID}`
}

export default _getHashFromSvgElement
