import { Types } from '@cornerstonejs/core';
import { AnnotationTool } from '../tools/index.js';
import { Annotation, Annotations } from './AnnotationTypes.js';

type ToolAnnotationsPair = {
  tool: AnnotationTool;
  annotations: Annotations;
};

type ToolAnnotationPair = {
  tool: AnnotationTool;
  annotation: Annotation;
};

type ToolsWithMoveableHandles = ToolAnnotationPair & {
  handle: Types.Point3;
};

export { ToolsWithMoveableHandles, ToolAnnotationsPair, ToolAnnotationPair };
