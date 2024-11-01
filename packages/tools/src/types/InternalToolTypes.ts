import type { Types } from '@cornerstonejs/core';
import type { AnnotationTool } from '../tools';
import type { Annotation, Annotations } from './AnnotationTypes';

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

export type {
  ToolsWithMoveableHandles,
  ToolAnnotationsPair,
  ToolAnnotationPair,
};
