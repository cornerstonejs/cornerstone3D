type SVGDrawingHelper = {
  svgLayerElement: HTMLDivElement;
  svgNodeCacheForCanvas: Record<string, unknown>;
  getSvgNode: (cacheKey: string) => SVGGElement | undefined;
  appendNode: (svgNode: SVGElement, cacheKey: string) => void;
  setNodeTouched: (cacheKey: string) => void;
  clearUntouched: () => void;
};

export default SVGDrawingHelper;
