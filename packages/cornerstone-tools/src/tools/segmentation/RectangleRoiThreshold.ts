import {
  getEnabledElement,
  getVolume,
  Settings,
  StackViewport,
  VolumeViewport,
  cache,
} from '@ohif/cornerstone-render'
import { getImageIdForTool } from '../../util/planar'
import {
  addToolState,
  getToolState,
  toolDataSelection,
} from '../../stateManagement'
import { isToolDataLocked } from '../../stateManagement/toolDataLocking'

import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import { ToolSpecificToolData, Point2, Point3 } from '../../types'
import thresholdVolume from './strategies/thresholdVolume'
import RectangleRoiTool from '../annotation/RectangleRoiTool'
import {
  setActiveLabelmapIndex,
  getActiveSegmentIndex,
  getColorForSegmentIndexColorLUT,
  getSegmentsLockedForElement,
  getNextLabelmapIndex,
} from '../../store/SegmentationModule'

interface RectangleRoiThresholdToolData extends ToolSpecificToolData {
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
  }
  data: {
    invalidated: boolean
    handles: {
      points: Point3[]
      activeHandleIndex: number | null
    }
    labelmapUID: string
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
      configuration: { shadow: true, preventHandleOutsideImage: false },
      strategies: {
        THRESHOLD_VOLUME: thresholdVolume,
      },
      defaultStrategy: 'THRESHOLD_VOLUME',
    })
  }

  addNewMeasurement = (evt: CustomEvent): RectangleRoiThresholdToolData => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    let referencedImageId
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId()
    } else {
      const { volumeUID } = this.configuration
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
    // decide on the active segmentIndex, active labelmapIndex etc.
    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.name,
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
        labelmapUID: null,
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

  /**
   * Executes the active strategy on the selected annotation
   * @param options LowerThreshold and HigherThreshold values
   * @returns
   */
  public execute(options: [number, number]) {
    const selectedToolState = toolDataSelection.getSelectedToolDataByToolName(
      this.name
    )

    if (selectedToolState.length !== 1) {
      console.warn('Annotation should be selected to execute a strategy')
      return
    }

    const toolData = selectedToolState[0] as RectangleRoiThresholdToolData
    const { viewUp, viewPlaneNormal, enabledElement } = toolData.metadata
    const { labelmapUID } = toolData.data
    const { viewport, renderingEngine } = enabledElement
    const { canvas: element } = viewport

    const labelmap = cache.getVolume(labelmapUID)

    const segmentIndex = getActiveSegmentIndex(element)
    const segmentColor = getColorForSegmentIndexColorLUT(
      element,
      labelmapUID,
      segmentIndex
    )
    const segmentsLocked = getSegmentsLockedForElement(element)

    const eventDetail = {
      canvas: element,
      enabledElement,
      renderingEngine,
    }

    const operationData = {
      points: toolData.data.handles.points,
      options,
      volumeUIDs: [this.configuration.volumeUID],
      labelmap,
      segmentIndex,
      segmentColor,
      segmentsLocked,
      viewPlaneNormal,
      viewUp,
    }

    return this.applyActiveStrategy(eventDetail, operationData)
  }

  _mouseUpCallback = async (evt) => {
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, newAnnotation, hasMoved } =
      this.editData
    const { data } = toolData

    if (newAnnotation && !hasMoved) {
      return
    }

    data.active = false
    data.handles.activeHandleIndex = null

    this._deactivateModify(element)
    this._deactivateDraw(element)

    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    this.editData = null
    this.isDrawing = false

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    // If already created the labelmap for this toolData return
    if (!toolData.data.labelmapUID) {
      // Otherwise Create Labelmap for the new rectangle measurement
      const labelmapIndex = getNextLabelmapIndex(element)
      const labelmapUID = await setActiveLabelmapIndex(element, labelmapIndex)

      toolData.data.labelmapUID = labelmapUID
    }
  }

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const eventData = evt.detail
    const { canvas: canvasElement } = eventData

    const { enabledElement } = svgDrawingHelper
    let toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(
      canvasElement,
      toolState
    )

    if (!toolState?.length) {
      return
    }

    const { viewport } = enabledElement

    let targetUID
    if (viewport instanceof StackViewport) {
      targetUID = this._getTargetStackUID(viewport)
    } else if (viewport instanceof VolumeViewport) {
      const scene = viewport.getScene()
      targetUID = this._getTargetVolumeUID(scene)
    } else {
      throw new Error(`Viewport Type not supported: ${viewport.type}`)
    }

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

  _getTargetStackUID(viewport) {
    return `stackTarget:${viewport.uid}`
  }

  _getTargetVolumeUID = (scene) => {
    if (this.configuration.volumeUID) {
      return this.configuration.volumeUID
    }

    const volumeActors = scene.getVolumeActors()

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return
    }

    return volumeActors[0].uid
  }
}
