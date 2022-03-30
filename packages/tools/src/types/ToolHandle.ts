import type { Types } from '@cornerstonejs/core';

/** Handle position in the world coordinates */
type AnnotationHandle = Types.Point3;

/** TextBox handle type specifying its location
 * in the world including bottomLeft and topRight
 * and bottomRight and topLeft points, and its
 * center world coordinates.
 */
type TextBoxHandle = {
  hasMoved: boolean;
  worldBoundingBox: {
    bottomLeft: Types.Point3;
    bottomRight: Types.Point3;
    topLeft: Types.Point3;
    topRight: Types.Point3;
  };
  worldPosition: Types.Point3;
};

/** Tool Handle type can be either AnnotationHandle or TextBoxHandle */
type ToolHandle = AnnotationHandle | TextBoxHandle;

export default ToolHandle;
export type { AnnotationHandle, TextBoxHandle };
