import Point3 from './Point3'

type ToolSpecificToolData = {
  metadata: {
    /**
     * The normal on which the tool was drawn
     */
    viewPlaneNormal: Point3
    /**
     * The viewUp on which the tool was drawn.
     */
    viewUp: Point3
    /**
     * A unique identifier for this tool data.
     */
    toolUID: string
    /**
     * The FrameOfReferenceUID
     */
    FrameOfReferenceUID: string
    /**
     * The registered name of the tool
     */
    toolName: string
  }
  data: any // Data specific to the toolType
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
  tool: any
  toolState: ToolSpecificToolState
}>

export {
  ToolSpecificToolData,
  ToolSpecificToolState,
  FrameOfReferenceSpecificToolState,
  ToolAndToolStateArray,
  ToolState,
}
