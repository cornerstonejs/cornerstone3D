import { state } from '../store/state';
import { getEnabledElement } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';

const VIEWPORT_ELEMENT = 'viewport-element';

/**
 * Returns the SVG drawing helper for the given HTML element.
 * @param element - The HTML element to get the SVG drawing helper for.
 * @private
 */
function getSvgDrawingHelper(element: HTMLDivElement): SVGDrawingHelper {
  const enabledElement = getEnabledElement(element);
  const { viewportId, renderingEngineId } = enabledElement;
  const canvasHash = `${viewportId}:${renderingEngineId}`;
  const svgLayerElement = _getSvgLayer(element);

  // Reset touched
  Object.keys(state.svgNodeCache[canvasHash]).forEach((cacheKey) => {
    state.svgNodeCache[canvasHash][cacheKey].touched = false;
  });

  const svgDrawingHelper = {
    svgLayerElement: svgLayerElement as unknown as Element,
    svgNodeCacheForCanvas: state.svgNodeCache,
    getSvgNode: getSvgNode.bind(this, canvasHash),
    appendNode: (svgNode: SVGElement, cacheKey: string) =>
      appendNode(svgDrawingHelper, canvasHash, svgNode, cacheKey),
    setNodeTouched: setNodeTouched.bind(this, canvasHash),
    clearUntouched: () => clearUntouched(svgDrawingHelper, canvasHash),
  } as SVGDrawingHelper;

  return svgDrawingHelper;
}

/**
 *
 * @param element
 * @private
 */
function _getSvgLayer(element) {
  const viewportElement = `.${VIEWPORT_ELEMENT}`;
  const internalDivElement = element.querySelector(viewportElement);

  // Using :scope to make sure the right svg layer is selected otherwise it
  // may select one from a nested viewport (eg: AdvancedMagnifyTool).
  const svgLayer = internalDivElement?.querySelector(':scope > .svg-layer');

  return svgLayer;
}

function getSvgNode(canvasHash, cacheKey) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return;
  }

  if (state.svgNodeCache[canvasHash][cacheKey]) {
    return state.svgNodeCache[canvasHash][cacheKey].domRef;
  }
}

function appendNode(
  svgDrawingHelper: SVGDrawingHelper,
  canvasHash,
  svgNode,
  cacheKey
) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return;
  }

  state.svgNodeCache[canvasHash][cacheKey] = {
    touched: true,
    domRef: svgNode,
  };

  const targetLayer = svgDrawingHelper.svgLayerElement;

  if (targetLayer) {
    targetLayer.appendChild(svgNode);
  }
}

function setNodeTouched(canvasHash, cacheKey) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return;
  }

  if (state.svgNodeCache[canvasHash][cacheKey]) {
    state.svgNodeCache[canvasHash][cacheKey].touched = true;
  }
}

function clearUntouched(svgDrawingHelper: SVGDrawingHelper, canvasHash) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return;
  }

  const rootLayer = svgDrawingHelper.svgLayerElement;

  Object.keys(state.svgNodeCache[canvasHash]).forEach((cacheKey) => {
    const cacheEntry = state.svgNodeCache[canvasHash][cacheKey];

    if (!cacheEntry.touched && cacheEntry.domRef) {
      const parent = cacheEntry.domRef.parentNode;

      if (parent) {
        parent.removeChild(cacheEntry.domRef);
      } else if (rootLayer?.contains(cacheEntry.domRef)) {
        rootLayer.removeChild(cacheEntry.domRef);
      }
      delete state.svgNodeCache[canvasHash][cacheKey];
    }
  });
}

export default getSvgDrawingHelper;
