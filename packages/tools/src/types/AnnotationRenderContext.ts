import type { Types } from '@cornerstonejs/core';
import type { Annotation } from './AnnotationTypes';
import type SVGDrawingHelper from './SVGDrawingHelper';
import type { AnnotationStyle } from './AnnotationStyle';

type AnnotationRenderContext = {
  enabledElement: Types.IEnabledElement;
  targetId: string;
  annotation: Annotation;
  annotationStyle: AnnotationStyle;
  svgDrawingHelper: SVGDrawingHelper;
};

export type { AnnotationRenderContext as default };
