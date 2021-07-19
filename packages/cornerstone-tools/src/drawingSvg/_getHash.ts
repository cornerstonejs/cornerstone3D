function _getHash(
  toolName: string,
  annotationUID: string,
  drawingElementType: string,
  nodeUID: string
): string {
  return `${toolName}::${annotationUID}::${drawingElementType}::${nodeUID}`
}

export default _getHash
