import {
  getEnabledElement,
  getVolume,
  Settings,
  StackViewport,
  metaData,
  Types,
  triggerEvent,
  eventTarget,
} from '@precisionmetrics/cornerstone-render'
import { vec3 } from 'gl-matrix'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import {
  getImageIdForTool,
  getSpacingInNormalDirection,
} from '../../util/planar'
import { addToolState, getToolState } from '../../stateManagement'
import { isToolDataLocked } from '../../stateManagement/annotation/toolDataLocking'
import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import throttle from '../../util/throttle'

import { hideElementCursor } from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import { ToolSpecificToolData, Point3 } from '../../types'
import RectangleRoiTool from '../annotation/RectangleRoiTool'

export interface RectangleRoiStartEndThresholdToolData
  extends ToolSpecificToolData {
  metadata: {
    cameraPosition?: Point3
    cameraFocalPoint?: Point3
    viewPlaneNormal?: Point3
    viewUp?: Point3
    toolDataUID?: string
    FrameOfReferenceUID: string
    referencedImageId?: string
    toolName: string
    enabledElement: any // Todo: how to remove this from the tooldata??
    volumeUID: string
    spacingInNormal: number
  }
  data: {
    invalidated: boolean
    startSlice: number
    endSlice: number
    cachedStats: {
      projectionPoints: Point3[][] // first slice p1, p2, p3, p4; second slice p1, p2, p3, p4 ...
      projectionPointsImageIds: string[]
    }
    handles: {
      points: Point3[]
      activeHandleIndex: number | null
    }
    // labelmapUID: string
    active: boolean
  }
}

/**
 * This tools is similar to the RectangleRoiThresholdTool which
 * only draws a rectangle on the image, and by using utility functions
 * such as thresholdByRange and thresholdByRoiStat it can be used to
 * create a segmentation. The only difference is that it only acts on the
 * acquisition plane and not the 3D volume, and accepts a start and end
 * slice, and renders a dashed rectangle on the image between the start and end
 * but a solid rectangle on start and end slice. Utility functions should be used
 * to modify the start and end slice.
 * // Todo: right now only the first slice has grabbable handles, need to make
 * // it so that the handles are grabbable on all slices.
 */
export default class RectangleRoiStartEndThresholdTool extends RectangleRoiTool {
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    viewportUIDsToRender: string[]
    handleIndex?: number
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(
    toolConfiguration: Record<string, any>,
    defaultToolConfiguration = {
      name: 'RectangleRoiStartEndThreshold',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {},
        defaultStrategy: undefined,
        activeStrategy: undefined,
        shadow: true,
        preventHandleOutsideImage: false,
        numSlicesToPropagate: 10,
      },
    }
  ) {
    super(toolConfiguration, defaultToolConfiguration)
    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStatsTool,
      100,
      { trailing: true }
    )
  }

  addNewMeasurement = (evt: CustomEvent) => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    let referencedImageId, imageVolume
    if (viewport instanceof StackViewport) {
      throw new Error('Stack Viewport Not implemented')
    } else {
      const { volumeUID } = this.configuration
      imageVolume = getVolume(volumeUID)
      referencedImageId = getImageIdForTool(
        worldPos,
        viewPlaneNormal,
        viewUp,
        imageVolume
      )
    }

    if (referencedImageId) {
      const colonIndex = referencedImageId.indexOf(':')
      referencedImageId = referencedImageId.substring(colonIndex + 1)
    } else {
      throw new Error('This tool does not work on non-acquisition planes')
    }

    const startIndex = viewport.getCurrentImageIdIndex()
    const spacingInNormal = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    )

    // We cannot simply add numSlicesToPropagate to startIndex because
    // the order of imageIds can be from top to bottom or bottom to top and
    // we want to make sure it is always propagated in the direction of the
    // view and also to make sure we don't go out of bounds.
    const endIndex = this._getEndSliceIndex(
      imageVolume,
      worldPos,
      spacingInNormal,
      viewPlaneNormal
    )

    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.name,
        volumeUID: this.configuration.volumeUID,
        spacingInNormal,
      },
      data: {
        invalidated: true,
        startSlice: startIndex,
        endSlice: endIndex,
        cachedStats: {
          projectionPoints: [],
          projectionPointsImageIds: [referencedImageId],
        },
        handles: {
          // No need a textBox
          textBox: {
            hasMoved: false,
            worldPosition: null,
            worldBoundingBox: null,
          },
          points: [
            <Point3>[...worldPos],
            <Point3>[...worldPos],
            <Point3>[...worldPos],
            <Point3>[...worldPos],
          ],
          activeHandleIndex: null,
        },
        labelmapUID: null,
        active: true,
      },
    }

    // update the projection points in 3D space, since we are projecting
    // the points to the slice plane, we need to make sure the points are
    // computed for later export
    this._computeProjectionPoints(toolData, imageVolume)

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, RectangleRoiStartEndThresholdTool)

    addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex: 3,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    hideElementCursor(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    return toolData
  }

  // Todo: make it work for other acquisition planes
  _computeProjectionPoints(
    toolData: RectangleRoiStartEndThresholdToolData,
    imageVolume: Types.IImageVolume
  ): void {
    const { data, metadata } = toolData
    const { viewPlaneNormal, spacingInNormal } = metadata
    const { imageData } = imageVolume
    const { startSlice, endSlice } = data
    const { projectionPoints } = data.cachedStats
    const { points } = data.handles

    const startIJK = vec3.create()
    imageData.worldToIndexVec3(points[0], startIJK)

    if (startIJK[2] !== startSlice) {
      throw new Error('Start slice does not match')
    }

    // subtitute the end slice index 2 with startIJK index 2
    const endIJK = vec3.fromValues(startIJK[0], startIJK[1], endSlice)

    const startWorld = vec3.create()
    imageData.indexToWorldVec3(startIJK, startWorld)

    const endWorld = vec3.create()
    imageData.indexToWorldVec3(endIJK, endWorld)

    // distance between start and end slice in the world coordinate
    const distance = vec3.distance(startWorld, endWorld)

    // for each point inside points, navigate in the direction of the viewPlaneNormal
    // with amount of spacingInNormal, and calculate the next slice until we reach the distance
    const newProjectionPoints = []
    for (let dist = 0; dist < distance; dist += spacingInNormal) {
      newProjectionPoints.push(
        points.map((point) => {
          const newPoint = vec3.create()
          vec3.scaleAndAdd(newPoint, point, viewPlaneNormal, dist)
          return Array.from(newPoint)
        })
      )
    }

    data.cachedStats.projectionPoints = newProjectionPoints

    // Find the imageIds for the projection points
    const projectionPointsImageIds = []
    for (const RectanglePoints of newProjectionPoints) {
      const imageId = getImageIdForTool(
        RectanglePoints[0],
        viewPlaneNormal,
        metadata.viewUp,
        imageVolume
      )
      projectionPointsImageIds.push(imageId)
    }

    data.cachedStats.projectionPointsImageIds = projectionPointsImageIds
  }

  _calculateCachedStatsTool(toolData, enabledElement) {
    const data = toolData.data
    const { viewportUID, renderingEngineUID } = enabledElement

    const { cachedStats } = data
    const imageVolume = getVolume(this.configuration.volumeUID)

    // Todo: this shouldn't be here, this is a performance issue
    // Since we are extending the RectangleRoi class, we need to
    // bring the logic for handle to some cachedStats calculation
    this._computeProjectionPoints(toolData, imageVolume)

    data.invalidated = false

    // Dispatching measurement modified
    const eventType = EVENTS.MEASUREMENT_MODIFIED

    const eventDetail = {
      toolData,
      viewportUID,
      renderingEngineUID,
    }
    triggerEvent(eventTarget, eventType, eventDetail)

    return cachedStats
  }

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const eventData = evt.detail
    const { element } = eventData

    const { enabledElement } = svgDrawingHelper
    const toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    // toolState = this.filterInteractableToolStateForElement(element, toolState)

    // if (!toolState?.length) {
    //   return
    // }

    const { viewport, renderingEngine } = enabledElement
    const sliceIndex = viewport.getCurrentImageIdIndex()

    const { volumeUID } = this.configuration
    const imageVolume = getVolume(volumeUID)

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as RectangleRoiStartEndThresholdToolData
      const settings = Settings.getObjectSettings(
        toolData,
        RectangleRoiStartEndThresholdTool
      )
      const toolMetadata = toolData.metadata
      const annotationUID = toolMetadata.toolDataUID

      const data = toolData.data
      const { startSlice, endSlice } = data
      const { points, activeHandleIndex } = data.handles

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const lineWidth = this.getStyle(settings, 'lineWidth', toolData)
      const lineDash = this.getStyle(settings, 'lineDash', toolData)
      const color = this.getStyle(settings, 'color', toolData)

      // range of slices to render based on the start and end slice, like
      // np arange

      // if indexIJK is outside the start/end slice, we don't render
      if (
        sliceIndex < Math.min(startSlice, endSlice) ||
        sliceIndex > Math.max(startSlice, endSlice)
      ) {
        continue
      }

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT

      if (data.invalidated) {
        this._throttledCalculateCachedStats(toolData, enabledElement)
      }

      // if it is inside the start/end slice, but not exactly the first or
      // last slice, we render the line in dash, but not the handles
      let firstOrLastSlice = false
      if (sliceIndex === startSlice || sliceIndex === endSlice) {
        firstOrLastSlice = true
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

      let activeHandleCanvasCoords

      if (
        !isToolDataLocked(toolData) &&
        !this.editData &&
        activeHandleIndex !== null &&
        firstOrLastSlice
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]]
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0'

        drawHandlesSvg(
          svgDrawingHelper,
          this.name,
          annotationUID,
          handleGroupUID,
          activeHandleCanvasCoords,
          {
            color,
          }
        )
      }

      let lineDashToUse = lineDash

      if (!firstOrLastSlice) {
        lineDashToUse = 2
      }

      const rectangleUID = '0'
      drawRectSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash: lineDashToUse,
          lineWidth,
        }
      )
    }
  }

  _getEndSliceIndex(
    imageVolume: Types.IImageVolume,
    worldPos: Point3,
    spacingInNormal: number,
    viewPlaneNormal: Point3
  ): number | undefined {
    const numSlicesToPropagate = this.configuration.numSlicesToPropagate

    // get end position by moving from worldPos in the direction of viewplaneNormal
    // with amount of numSlicesToPropagate * spacingInNormal
    const endPos = vec3.create()
    vec3.scaleAndAdd(
      endPos,
      worldPos,
      viewPlaneNormal,
      numSlicesToPropagate * spacingInNormal
    )

    const halfSpacingInNormalDirection = spacingInNormal / 2
    // Loop through imageIds of the imageVolume and find the one that is closest to endPos
    const { imageIds } = imageVolume
    let imageIdIndex
    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i]

      const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId)

      const dir = vec3.create()
      vec3.sub(dir, endPos, imagePositionPatient)

      const dot = vec3.dot(dir, viewPlaneNormal)

      if (Math.abs(dot) < halfSpacingInNormalDirection) {
        imageIdIndex = i
      }
    }

    return imageIdIndex
  }
}
