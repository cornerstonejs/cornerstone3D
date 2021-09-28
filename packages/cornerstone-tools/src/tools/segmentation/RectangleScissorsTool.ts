import {
  cache,
  getEnabledElement,
  Settings,
  StackViewport,
  VolumeViewport,
} from '@ohif/cornerstone-render'
import { BaseTool } from '../base'
import { Point3, Point2 } from '../../types'
import { fillInsideRectangle } from './strategies/fillInsideRectangle'
import { getViewportUIDsWithLabelmapToRender } from '../../util/viewportFilters'

import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import RectangleRoiTool from '../annotation/RectangleRoiTool'
import {
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'

import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'
import {
  setActiveLabelmapIndex,
  getActiveLabelmapIndex,
  setLabelmapForElement,
} from '../../store/SegmentationModule'

// import {
//   segRectangleFillInsideCursor,
//   segRectangleFillOutsideCursor,
//   segRectangleEraseInsideCursor,
//   segRectangleEraseOutsideCursor,
// } from '../cursors'

/**
 * @public
 * @class RectangleScissorsTool
 * @memberof Tools
 * @classdesc Tool for manipulating labelmap data by drawing a rectangle.
 * @extends Tools.Base.BaseTool
 */
export default class RectangleScissorsTool extends BaseTool {
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    labelmap: any
    segmentIndex: number
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'RectangleScissors',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {},
      strategies: {
        FILL_INSIDE: fillInsideRectangle,
      },
      defaultStrategy: 'FILL_INSIDE',
    })
  }

  addNewState = async (evt) => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    const labelmapIndex = getActiveLabelmapIndex(element)
    if (labelmapIndex === undefined) {
      throw new Error(
        'No active labelmap detected, create one before using scissors tool'
      )
    }
    const labelmapUID = await setActiveLabelmapIndex(element, labelmapIndex)
    const labelmap = cache.getVolume(labelmapUID)

    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          points: [
            <Point3>[...worldPos],
            <Point3>[...worldPos],
            <Point3>[...worldPos],
            <Point3>[...worldPos],
          ],
          activeHandleIndex: null,
        },
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    // Todo: color the rectangle accordingly to the segment index
    Settings.getObjectSettings(toolData, RectangleRoiTool)

    // addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithLabelmapToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      labelmap,
      viewportUIDsToRender,
      handleIndex: 3,
      movingTextBox: false,
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
  }

  _mouseDragCallback = (evt) => {
    this.isDrawing = true

    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, handleIndex } = this.editData
    const { data } = toolData

    // Moving handle.
    const { currentPoints } = eventData
    const enabledElement = getEnabledElement(element)
    const { worldToCanvas, canvasToWorld } = enabledElement.viewport
    const worldPos = currentPoints.world

    const { points } = data.handles

    // Move this handle.
    points[handleIndex] = [...worldPos]

    let bottomLeftCanvas
    let bottomRightCanvas
    let topLeftCanvas
    let topRightCanvas

    let bottomLeftWorld
    let bottomRightWorld
    let topLeftWorld
    let topRightWorld

    switch (handleIndex) {
      case 0:
      case 3:
        // Moving bottomLeft or topRight

        bottomLeftCanvas = worldToCanvas(points[0])
        topRightCanvas = worldToCanvas(points[3])

        bottomRightCanvas = [topRightCanvas[0], bottomLeftCanvas[1]]
        topLeftCanvas = [bottomLeftCanvas[0], topRightCanvas[1]]

        bottomRightWorld = canvasToWorld(bottomRightCanvas)
        topLeftWorld = canvasToWorld(topLeftCanvas)

        points[1] = bottomRightWorld
        points[2] = topLeftWorld

        break
      case 1:
      case 2:
        // Moving bottomRight or topLeft
        bottomRightCanvas = worldToCanvas(points[1])
        topLeftCanvas = worldToCanvas(points[2])

        bottomLeftCanvas = <Point2>[topLeftCanvas[0], bottomRightCanvas[1]]
        topRightCanvas = <Point2>[bottomRightCanvas[0], topLeftCanvas[1]]

        bottomLeftWorld = canvasToWorld(bottomLeftCanvas)
        topRightWorld = canvasToWorld(topRightCanvas)

        points[0] = bottomLeftWorld
        points[3] = topRightWorld

        break
    }
    data.invalidated = true

    this.editData.hasMoved = true

    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseUpCallback = (evt) => {
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, newAnnotation, hasMoved, labelmap, segmentIndex } =
      this.editData
    const { data } = toolData

    if (newAnnotation && !hasMoved) {
      return
    }

    data.active = false
    data.handles.activeHandleIndex = null

    this._deactivateDraw(element)

    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.editData = null
    this.isDrawing = false

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet')
    }

    const operationData = {
      points: data.handles.points,
      labelmap,
      segmentIndex,
    }

    const eventDetail = {
      canvas: element,
      enabledElement,
      renderingEngine,
    }

    this.applyActiveStrategy(eventDetail, operationData)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event propagation.
   */
  _activateDraw = (element) => {
    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    if (!this.editData) {
      return
    }

    const { enabledElement } = svgDrawingHelper
    const { viewport } = enabledElement

    // if (viewport instanceof StackViewport) {
    //   // targetUID = this._getTargetStackUID(viewport)
    //   throw new Error('Stack viewport segmentation not implemented yet')
    // } else if (viewport instanceof VolumeViewport) {
    //   const scene = viewport.getScene()
    //   targetUID = this._getTargetVolumeUID(scene)
    // } else {
    //   throw new Error(`Viewport Type not supported: ${viewport.type}`)
    // }

    const { toolData } = this.editData

    // Todo: rectangle colro based on segment index
    const settings = Settings.getObjectSettings(toolData, RectangleRoiTool)
    const toolMetadata = toolData.metadata
    const annotationUID = toolMetadata.toolDataUID

    const data = toolData.data
    const { points } = data.handles
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
    const color = 'red'

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed')
      return
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
      }
    )
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
