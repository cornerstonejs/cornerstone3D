import { Point3 } from './../types'
import BaseAnnotationTool from '../tools/base/BaseAnnotationTool'

type ToolSpecificToolData = {
  /**
   * Determine if the tool data instance is in a locked state.
   */
  isLocked?: boolean
  metadata: {
    /**
     * The position of the camera in world space
     */
    cameraPosition?: Point3
    /**
     * The focal point of the camera in world space
     */
    cameraFocalPoint?: Point3
    /**
     * The normal on which the tool was drawn
     */
    viewPlaneNormal?: Point3
    /**
     * The viewUp on which the tool was drawn.
     */
    viewUp?: Point3
    /**
     * A unique identifier for this tool data.
     */
    toolDataUID?: string
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
     * The registered name of the tool
     */
    label?: string
    /**
     * The registered name of the tool
     */
    text?: string
    /**
     * VolumeUID of the volume that the tool was configured to work on.
     */
    volumeUID?: string
  }
  data: {
    handles: {
      points?: Point3[]
      activeHandleIndex?: number | null
      textBox?: {
        hasMoved: boolean
        worldPosition: Point3
        worldBoundingBox: {
          topLeft: Point3
          topRight: Point3
          bottomLeft: Point3
          bottomRight: Point3
        }
      }
      activeOperation?: number | null
      rotationPoints?: unknown
      slabThicknessPoints?: unknown
    }
    active: boolean
    cachedStats?: unknown
    invalidated?: boolean
    activeViewportUIDs?: string[]
    viewportUID?: string
  }
}

type ToolSpecificToolState = Array<ToolSpecificToolData>

type FrameOfReferenceSpecificToolState = {
  // Any string key must have type of Array<ToolSpecificToolData>
  [key: string]: ToolSpecificToolState
}

type ToolState = {
  // Any string key must have type of FrameOfReferenceSpecificToolState
  [key: string]: FrameOfReferenceSpecificToolState
}

type ToolAndToolStateArray = Array<{
  tool: BaseAnnotationTool
  toolState: ToolSpecificToolState
}>

export {
  ToolSpecificToolData,
  ToolSpecificToolState,
  FrameOfReferenceSpecificToolState,
  ToolAndToolStateArray,
  ToolState,
}
