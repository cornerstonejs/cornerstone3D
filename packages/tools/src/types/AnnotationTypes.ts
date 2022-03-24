import type { Types } from '@cornerstonejs/core'

type Annotation = {
  /** A unique identifier for this annotation */
  annotationUID?: string
  /** If the annotation is being hovered over and is highlighted */
  highlighted?: boolean
  /** If the annotation is locked for manipulation */
  isLocked?: boolean
  /** Has annotation data been invalidated (e.g., as a result of mouse interactions) */
  invalidated?: boolean
  /** Metadata for annotation */
  metadata: {
    /**
     * The position of the camera in world space
     */
    cameraPosition?: Types.Point3
    /**
     * The focal point of the camera in world space
     */
    cameraFocalPoint?: Types.Point3
    /**
     * The normal on which the tool was drawn
     */
    viewPlaneNormal?: Types.Point3
    /**
     * The viewUp on which the tool was drawn.
     */
    viewUp?: Types.Point3
    /**
     * The FrameOfReferenceUID
     */
    FrameOfReferenceUID: string
    /**
     * The registered name of the tool
     */
    toolName: string
    /**
     * An optional property used when annotating on a slice in a StackViewport,
     * or when annotating in a VolumeViewport on a viewPlane that corresponds to
     * original slice-based image data.
     */
    referencedImageId?: string
    /**
     * VolumeId of the volume that the tool was configured to work on.
     */
    volumeId?: string
  }
  /**
   * Data for annotation, Derivatives need to define their own data types.
   */
  data: {
    /** Annotation handles that are grabbable for manipulation */
    handles?: {
      /** world location of the handles in the space */
      points?: Types.Point3[]
      /** index of the active handle being manipulated */
      activeHandleIndex?: number | null
      /** annotation text box information */
      textBox?: {
        /** whether the text box has moved */
        hasMoved: boolean
        /** the world location of the text box */
        worldPosition: Types.Point3
        /** text box bounding box information */
        worldBoundingBox: {
          /** Top left location of the text box in the world space */
          topLeft: Types.Point3
          /** Top right location of the text box in the world space */
          topRight: Types.Point3
          /** Bottom left location of the text box in the world space */
          bottomLeft: Types.Point3
          /** Bottom right location of the text box in the world space */
          bottomRight: Types.Point3
        }
      }
      [key: string]: any
    }
    /** Cached Annotation statistics which is specific to the tool */
    cachedStats?: unknown
  }
}

/** Array of annotations */
type Annotations = Array<Annotation>

/** FrameOfReferenceSpecificAnnotations which has all annotations from all
 * tools for the each frame of reference.
 */
type FrameOfReferenceSpecificAnnotations = {
  /** Each tool annotations */
  [key: string]: Annotations
}

/**
 * All frame of reference specific annotations for all tools.
 */
type AnnotationState = {
  // Any string key must have type of FrameOfReferenceSpecificAnnotations
  [key: string]: FrameOfReferenceSpecificAnnotations
}

export {
  FrameOfReferenceSpecificAnnotations,
  AnnotationState,
  Annotations,
  Annotation,
}
