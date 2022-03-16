import type { Types } from '@precisionmetrics/cornerstone-render'

type Annotation = {
  /**
   * A unique identifier for this annotation.
   */
  annotationUID?: string
  highlighted?: boolean
  isLocked?: boolean
  invalidated?: boolean
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
     * VolumeUID of the volume that the tool was configured to work on.
     */
    volumeUID?: string
  }
  /**
   * Data for annotation, Derivatives need to define their own data types.
   */
  data: {
    handles?: {
      points?: Types.Point3[]
      activeHandleIndex?: number | null
      textBox?: {
        hasMoved: boolean
        worldPosition: Types.Point3
        worldBoundingBox: {
          topLeft: Types.Point3
          topRight: Types.Point3
          bottomLeft: Types.Point3
          bottomRight: Types.Point3
        }
      }
      [key: string]: any
    }
    cachedStats?: unknown
  }
}

type Annotations = Array<Annotation>

type FrameOfReferenceSpecificAnnotations = {
  // Any string key must have type of Array<Annotation>
  [key: string]: Annotations
}

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
