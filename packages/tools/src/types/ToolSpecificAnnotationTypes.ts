import type { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';

interface ROICachedStats {
  [targetId: string]: {
    Modality: string;
    area: number;
    areaUnit: string;
    max: number;
    mean: number;
    stdDev: number;
  };
}

export interface RectangleROIAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
      textBox: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    label: string;
    cachedStats?:
      | ROICachedStats
      | {
          projectionPoints?: Types.Point3[];
          projectionPointsImageIds?: string[];
        };
  };
}

export interface ProbeAnnotation extends Annotation {
  data: {
    handles: { points: Types.Point3[] };
    cachedStats: {
      [targetId: string]: {
        Modality: string;
        index: Types.Point3;
        value: number;
      };
    };
    label: string;
  };
}

export interface LengthAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
      textBox: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    label: string;
    cachedStats: {
      [targetId: string]: {
        length: number;
        unit: string;
      };
    };
  };
}

export interface AdvancedMagnifyAnnotation extends Annotation {
  data: {
    zoomFactor: number;
    sourceViewportId: string;
    magnifyViewportId: string;
    handles: {
      points: Types.Point3[]; // [top, right, bottom, left]
      activeHandleIndex: number | null;
    };
  };
}

export interface CircleROIAnnotation extends Annotation {
  data: {
    handles: {
      points: [Types.Point3, Types.Point3]; // [center, end]
      activeHandleIndex: number | null;
      textBox?: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    label: string;
    cachedStats?: ROICachedStats & {
      [targetId: string]: {
        radius: number;
        radiusUnit: string;
        perimeter: number;
      };
    };
  };
}

export interface EllipticalROIAnnotation extends Annotation {
  data: {
    handles: {
      points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3]; // [bottom, top, left, right]
      activeHandleIndex: number | null;
      textBox?: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    label: string;
    cachedStats?: ROICachedStats;
    initialRotation: number;
  };
}

export interface BidirectionalAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
      textBox: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    label: string;
    cachedStats: {
      [targetId: string]: {
        length: number;
        width: number;
        unit: string;
      };
    };
  };
}

export interface RectangleROIThresholdAnnotation extends Annotation {
  metadata: {
    cameraPosition?: Types.Point3;
    cameraFocalPoint?: Types.Point3;
    viewPlaneNormal?: Types.Point3;
    viewUp?: Types.Point3;
    annotationUID?: string;
    FrameOfReferenceUID: string;
    referencedImageId?: string;
    toolName: string;
    enabledElement: Types.IEnabledElement; // Todo: how to remove this from the annotation??
    volumeId: string;
  };
  data: {
    label: string;
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
    };
  };
}

export interface RectangleROIStartEndThresholdAnnotation extends Annotation {
  metadata: {
    cameraPosition?: Types.Point3;
    cameraFocalPoint?: Types.Point3;
    viewPlaneNormal?: Types.Point3;
    viewUp?: Types.Point3;
    annotationUID?: string;
    FrameOfReferenceUID: string;
    referencedImageId?: string;
    toolName: string;
    enabledElement: any; // Todo: how to remove this from the annotation??
    volumeId: string;
    spacingInNormal: number;
  };
  data: {
    label: string;
    startSlice: number;
    endSlice: number;
    cachedStats: {
      projectionPoints: Types.Point3[][]; // first slice p1, p2, p3, p4; second slice p1, p2, p3, p4 ...
      projectionPointsImageIds: string[];
    };
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
    };
  };
}

export interface PlanarFreehandROIAnnotation extends Annotation {
  metadata: {
    cameraPosition?: Types.Point3;
    cameraFocalPoint?: Types.Point3;
    viewPlaneNormal?: Types.Point3;
    viewUp?: Types.Point3;
    annotationUID?: string;
    FrameOfReferenceUID: string;
    referencedImageId?: string;
    toolName: string;
  };
  data: {
    polyline: Types.Point3[];
    label?: string;
    isOpenContour?: boolean;
    isOpenUShapeContour?: boolean;
    // Present if isOpenUShapeContour is true:
    openUShapeContourVectorToPeak?: Types.Point3[];
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
      textBox: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    cachedStats?: ROICachedStats;
  };
}

export interface ArrowAnnotation extends Annotation {
  data: {
    text: string;
    handles: {
      points: Types.Point3[];
      arrowFirst: boolean;
      activeHandleIndex: number | null;
      textBox: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
  };
}

export interface AngleAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
      textBox: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    label: string;
    cachedStats: {
      [targetId: string]: {
        angle: number;
      };
    };
  };
}

export interface CobbAngleAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
      textBox: {
        hasMoved: boolean;
        worldPosition: Types.Point3;
        worldBoundingBox: {
          topLeft: Types.Point3;
          topRight: Types.Point3;
          bottomLeft: Types.Point3;
          bottomRight: Types.Point3;
        };
      };
    };
    label: string;
    cachedStats: {
      [targetId: string]: {
        angle: number;
        arc1Angle: number;
        arc2Angle: number;
        points: {
          world: {
            arc1Start: Types.Point3;
            arc1End: Types.Point3;
            arc2Start: Types.Point3;
            arc2End: Types.Point3;
            arc1Angle: number;
            arc2Angle: number;
          };
          canvas: {
            arc1Start: Types.Point2;
            arc1End: Types.Point2;
            arc2Start: Types.Point2;
            arc2End: Types.Point2;
            arc1Angle: number;
            arc2Angle: number;
          };
        };
      };
    };
  };
}

export interface ReferenceCursor extends Annotation {
  data: {
    handles: {
      points: [Types.Point3];
    };
  };
}

export interface ReferenceLineAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[];
    };
  };
}

export interface ScaleOverlayAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[];
    };
    viewportId: string;
  };
}

export interface VideoRedactionAnnotation extends Annotation {
  metadata: {
    viewPlaneNormal: Types.Point3;
    viewUp: Types.Point3;
    FrameOfReferenceUID: string;
    referencedImageId: string;
    toolName: string;
  };
  data: {
    invalidated: boolean;
    handles: {
      points: Types.Point3[];
      activeHandleIndex: number | null;
    };
    cachedStats: {
      [key: string]: any; // Can be more specific if the structure is known
    };
    active: boolean;
  };
}
