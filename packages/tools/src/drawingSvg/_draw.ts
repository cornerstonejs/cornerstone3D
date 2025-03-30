import type { SVGDrawingHelper } from '../types';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import setNewAttributesIfValid from './setNewAttributesIfValid';

function _draw(
  what: 'circle' | 'line' | 'ellipse' | 'rect' | 'path' | 'polyline' | 'g',
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  drawingId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>
): {
  element: SVGGElement;
  isNew: boolean;
} {
  // variable for the namespace
  const svgns = 'http://www.w3.org/2000/svg';
  const dataId = `${what}-${annotationUID}-${drawingId}`;
  const existingElement = svgDrawingHelper.getSvgNode(dataId);

  if (existingElement) {
    setAttributesIfNecessary(attributes, existingElement);
    svgDrawingHelper.setNodeTouched(dataId);
    return { element: existingElement, isNew: false };
  } else {
    const newElement = document.createElementNS(svgns, what);
    newElement.setAttribute('data-id', dataId);
    setNewAttributesIfValid(attributes, newElement);
    svgDrawingHelper.appendNode(newElement, dataId);
    return { element: newElement, isNew: true };
  }
}

export default _draw;
