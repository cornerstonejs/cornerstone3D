function _getHash(
  toolUID: string,
  annotationUID: string,
  drawingElementType: string,
  nodeUID: string
): string {
  return `${toolUID}::${annotationUID}::${drawingElementType}::${nodeUID}`
}

export default _getHash
