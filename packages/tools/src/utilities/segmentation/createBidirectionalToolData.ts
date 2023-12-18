import type { Types } from '@cornerstonejs/core';
import type { BidirectionalData } from './contourAndFindLargestBidirectional';
import type { Annotation } from '../../types/AnnotationTypes';

/**
 * Creates data suitable for the BidirectionalTool from the basic bidirectional
 * data object.
 */
export default function createBidirectionalToolData(
  bidirectionalData: BidirectionalData,
  viewport
): Annotation {
  const {
    majorAxis,
    minorAxis,
    label = '',
    FrameOfReferenceUID,
    referencedImageId,
  } = bidirectionalData;
  const [major0, major1] = majorAxis;
  const [minor0, minor1] = minorAxis;

  const { viewUp, viewPlaneNormal } = viewport.getCamera();
  const points = [major0, major1, minor0, minor1];
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
