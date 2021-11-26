import {
  getEnabledElement,
  getVolume,
  Settings,
  StackViewport,
} from '@precisionmetrics/cornerstone-render'
import { getImageIdForTool } from '../../util/planar'
import { addToolState, getToolState } from '../../stateManagement'
import { isToolDataLocked } from '../../stateManagement/toolDataLocking'
import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import { hideElementCursor } from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import { ToolSpecificToolData, Point3 } from '../../types'
import RectangleRoiTool from '../annotation/RectangleRoiTool'

export interface RectangleRoiThresholdManualToolData
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
  }
  data: {
    invalidated: boolean
    startSlice: number
    endSlice: number
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
 * but a solid rectangle on start and end slice.
 */
export default class RectangleRoiThresholdManualTool extends RectangleRoiTool {
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
      name: 'RectangleRoiThresholdManual',
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
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId()
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

    const { imageIds } = imageVolume

    // find inside imageIds the index of the referencedImageId, by breaking
    // imageIds are like ['csiv:imageId1', 'csiv:imageId2', ...] and we
    // want to find the index of 'imageId2'
    const imageIdIndex = imageIds.findIndex((imageId) => {
      const colonIndex = imageId.indexOf(':')
      const imageIdSubstring = imageId.substring(colonIndex + 1)
      return imageIdSubstring === referencedImageId
    })

    const sliceIndex = viewport.getCurrentImageIdIndex()

    if (sliceIndex !== imageIdIndex) {
      throw new Error(
        'This tool does not work on non-acquisition planes, or the referenced image is not the current image'
      )
    }

    const startSlice = imageIdIndex
    const endSlice = imageIdIndex + this.configuration.numSlicesToPropagate

    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.name,
        volumeUID: this.configuration.volumeUID,
      },
      data: {
        invalidated: true,
        startSlice,
        endSlice,
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

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, RectangleRoiThresholdManualTool)

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
    const toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    // toolState = this.filterInteractableToolStateForElement(element, toolState)

    // if (!toolState?.length) {
    //   return
    // }

    const { viewport } = enabledElement
    const sliceIndex = viewport.getCurrentImageIdIndex()

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as RectangleRoiThresholdManualToolData
      const settings = Settings.getObjectSettings(
        toolData,
        RectangleRoiThresholdManualTool
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

      // if indexIJK is outside the start/end slice, we don't render
      if (sliceIndex < startSlice || sliceIndex > endSlice) {
        continue
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
}
