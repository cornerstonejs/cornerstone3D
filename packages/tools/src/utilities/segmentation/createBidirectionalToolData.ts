import type { Types } from '@cornerstonejs/core';

export default function createBidirectionalToolData(
  bidirectionalData,
  viewport
) {
  const {
    handle0,
    handle1,
    handle2,
    handle3,
    label = '',
    FrameOfReferenceUID,
    referencedImageId,
  } = bidirectionalData;
  const { viewUp, viewPlaneNormal } = viewport.getCamera();
  const points = [handle0, handle1, handle2, handle3];
  const bidirectionalToolData = {
    highlighted: true,
    invalidated: true,
    metadata: {
      toolName: 'Bidirectional',
      viewPlaneNormal,
      viewUp,
      FrameOfReferenceUID,
      referencedImageId,
    },
    data: {
      handles: {
        points,
        textBox: {
          hasMoved: false,
          worldPosition: [0, 0, 0] as Types.Point3,
          worldBoundingBox: {
            topLeft: [0, 0, 0] as Types.Point3,
            topRight: [0, 0, 0] as Types.Point3,
            bottomLeft: [0, 0, 0] as Types.Point3,
            bottomRight: [0, 0, 0] as Types.Point3,
          },
        },
        activeHandleIndex: null,
      },
      label,
      cachedStats: {},
    },
    isLocked: false,
    isVisible: true,
  };
  return bidirectionalToolData;
}
