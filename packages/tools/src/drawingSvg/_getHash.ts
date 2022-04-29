function _getHash(
  annotationUID: string,
  drawingElementType: string,
  nodeUID: string
): string {
  return `${annotationUID}::${drawingElementType}::${nodeUID}`;
}

export default _getHash;
