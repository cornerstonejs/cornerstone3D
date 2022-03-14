import type { Types } from '@precisionmetrics/cornerstone-render'
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

type ToolAndToolDataArray = Array<{
  tool: BaseAnnotationTool
  toolData: ToolSpecificToolData
}>

export {
  ToolSpecificToolData,
  ToolSpecificToolState,
  FrameOfReferenceSpecificToolState,
  ToolAndToolStateArray,
  ToolAndToolDataArray,
  ToolState,
}
