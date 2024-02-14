import type { Types } from '@cornerstonejs/core';
import type { Annotation } from '../../types/AnnotationTypes';

export type BidirectionalData = {
  majorAxis: [Types.Point3, Types.Point3];
  minorAxis: [Types.Point3, Types.Point3];
  maxMajor: number;
  maxMinor: number;
  segmentIndex: number;
  label?: string;
  color?: string | number[];
  referencedImageId: string;
  sliceIndex: number;
};

/**
 * Creates data suitable for the BidirectionalTool from the basic bidirectional
 * data object.
 */
export default function createBidirectionalToolData(
  bidirectionalData: BidirectionalData,
  viewport
): Annotation {
  const { majorAxis, minorAxis, label = '', sliceIndex } = bidirectionalData;
  const [major0, major1] = majorAxis;
  const [minor0, minor1] = minorAxis;

  const points = [major0, major1, minor0, minor1];
  const bidirectionalToolData = {
    highlighted: true,
    invalidated: true,
    metadata: {
      toolName: 'Bidirectional',
      // Get a view reference for the slice this applies to, not the currently
      // displayed slice.  This will fill in the remaining data for that slice
      ...viewport.getViewReference({ sliceIndex }),
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
