import {
  getEnabledElement,
  getVolume,
  Settings,
  StackViewport,
  triggerEvent,
  eventTarget,
} from '@precisionmetrics/cornerstone-render'
import { getImageIdForTool } from '../../util/planar'
import { addToolState, getToolState } from '../../stateManagement'
import { isToolDataLocked } from '../../stateManagement/annotation/toolDataLocking'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'

import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import { hideElementCursor } from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import { ToolSpecificToolData, Point3 } from '../../types'
import RectangleRoiTool from '../annotation/RectangleRoiTool'

export interface RectangleRoiThresholdToolData extends ToolSpecificToolData {
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
  }
  data: {
    invalidated: boolean
    handles: {
      points: Point3[]
      activeHandleIndex: number | null
    }
    // segmentationUID: string
    active: boolean
  }
}

export default class RectangleRoiThresholdTool extends RectangleRoiTool {
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

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'RectangleRoiThreshold',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    })
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

    let referencedImageId, volumeUID
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId()
    } else {
      volumeUID = this.getTargetUID(viewport)
      const imageVolume = getVolume(volumeUID)
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
    }

    // Todo: how not to store enabledElement on the toolData, segmentationModule needs the element to
    // decide on the active segmentIndex, active segmentationIndex etc.
    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.name,
        volumeUID,
      },
      data: {
        invalidated: true,
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
        segmentationUID: null,
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, RectangleRoiThresholdTool)

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

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const eventData = evt.detail
    const { element } = eventData

    const { enabledElement } = svgDrawingHelper
    let toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(element, toolState)

    if (!toolState?.length) {
      return
    }

    const { viewport, renderingEngineUID } = enabledElement

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as RectangleRoiThresholdToolData
      const settings = Settings.getObjectSettings(
        toolData,
        RectangleRoiThresholdTool
      )
      const toolMetadata = toolData.metadata
      const annotationUID = toolMetadata.toolDataUID

      const data = toolData.data
      const { points, activeHandleIndex } = data.handles
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const lineWidth = this.getStyle(settings, 'lineWidth', toolData)
      const lineDash = this.getStyle(settings, 'lineDash', toolData)
      const color = this.getStyle(settings, 'color', toolData)

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

      // Todo: This is not correct way to add the event trigger,
      // this will trigger on all mouse hover too. Problem is that we don't
      // have a cached stats mechanism for this tool yet?
      const eventType = EVENTS.MEASUREMENT_MODIFIED

      const eventDetail = {
        toolData,
        viewportUID: viewport.uid,
        renderingEngineUID,
      }
      triggerEvent(eventTarget, eventType, eventDetail)

      let activeHandleCanvasCoords

      if (
        !isToolDataLocked(toolData) &&
        !this.editData &&
        activeHandleIndex !== null
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
          lineDash,
          lineWidth,
        }
      )
    }
  }
}
