import type { Types } from '@cornerstonejs/core';
import type { Annotation } from './AnnotationTypes.js';
import type SVGDrawingHelper from './SVGDrawingHelper.js';

type AnnotationRenderContext = {
  enabledElement: Types.IEnabledElement;
  targetId: string;
  annotation: Annotation;
  annotationStyle: Record<string, any>;
  svgDrawingHelper: SVGDrawingHelper;
};

export default AnnotationRenderContext;
