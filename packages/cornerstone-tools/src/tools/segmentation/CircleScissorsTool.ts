import {
  cache,
  getEnabledElement,
  Settings,
  StackViewport,
  VolumeViewport,
} from '@ohif/cornerstone-render'
import { BaseTool } from '../base'
import { Point3, Point2 } from '../../types'

import { getViewportUIDsWithLabelmapToRender } from '../../util/viewportFilters'
import { fillInsideCircle, fillOutsideCircle } from './strategies/fillCircle'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import RectangleRoiTool from '../annotation/RectangleRoiTool'
import { drawCircle as drawCircleSvg } from '../../drawingSvg'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'

import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'
import {
  setActiveLabelmapIndex,
  getActiveLabelmapIndex,
  getActiveSegmentIndex,
  getColorForSegmentIndex,
  getLockedSegmentsForElement,
} from '../../store/SegmentationModule'

// Todo
// Define type for toolData

/**
 * @public
 * @class CircleScissorsTool
 * @memberof Tools
 * @classdesc Tool for manipulating labelmap data by drawing a rectangle.
 * @extends Tools.Base.BaseTool
 */
export default class CircleScissorsTool extends BaseTool {
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    labelmap: any
    segmentIndex: number
    segmentsLocked: number[]
    segmentColor: [number, number, number, number]
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
      name: 'CircleScissors',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {},
      strategies: {
        FILL_INSIDE: fillInsideCircle,
        FILL_OUTSIDE: fillOutsideCircle,
      },
      defaultStrategy: 'FILL_INSIDE',
    })
  }

  addNewMeasurement = async (evt) => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const canvasPos = currentPoints.canvas

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
    const segmentIndex = getActiveSegmentIndex(element)
    const segmentColor = getColorForSegmentIndex(
      element,
      segmentIndex,
      labelmapIndex
    )
    const segmentsLocked = getLockedSegmentsForElement(element)

    const labelmap = cache.getVolume(labelmapUID)

    // Todo: Used for drawing the svg only, we might not need it at all
    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.name,
        segmentColor,
      },
      data: {
        invalidated: true,
        handles: {
          points: {
            radius: 1,
            center: {
              world: worldPos,
              canvas: canvasPos,
            },
            bottom: {
              world: [0, 0, 0],
              canvas: [0, 0, 0],
            },
            top: {
              world: [0, 0, 0],
              canvas: [0, 0, 0],
            },
            left: {
              world: [0, 0, 0],
              canvas: [0, 0, 0],
            },
            right: {
              world: [0, 0, 0],
              canvas: [0, 0, 0],
            },
          },
          activeHandleIndex: null,
        },
        isDrawing: true,
        cachedStats: {},
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    // Settings.getObjectSettings(toolData, RectangleRoiTool)

    const viewportUIDsToRender = [viewport.uid]

    this.editData = {
      toolData,
      labelmap,
      segmentIndex,
      segmentsLocked,
      segmentColor,
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
    const { currentPoints } = eventData
    const currentCanvasPoints = currentPoints.canvas
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const { canvasToWorld } = viewport

    //////
    const { toolData, viewportUIDsToRender } = this.editData
    const { data } = toolData
    const { center } = data.handles.points

    // Center of circle in canvas Coordinates
    const { canvas: centerCanvas } = center

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1])
    const radius = Math.sqrt(dX * dX + dY * dY)

    const bottomCanvas = [centerCanvas[0], centerCanvas[1] + radius]
    const topCanvas = [centerCanvas[0], centerCanvas[1] - radius]
    const leftCanvas = [centerCanvas[0] - radius, centerCanvas[1]]
    const rightCanvas = [centerCanvas[0] + radius, centerCanvas[1]]

    data.handles.points = Object.assign(data.handles.points, {
      radius,
      bottom: {
        world: canvasToWorld(bottomCanvas),
        canvas: bottomCanvas,
      },
      top: {
        world: canvasToWorld(topCanvas),
        canvas: topCanvas,
      },
      left: {
        world: canvasToWorld(leftCanvas),
        canvas: leftCanvas,
      },
      right: {
        world: canvasToWorld(rightCanvas),
        canvas: rightCanvas,
      },
    })

    data.invalidated = true

    this.editData.hasMoved = true

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseUpCallback = (evt) => {
    const eventData = evt.detail
    const { element } = eventData

    const {
      toolData,
      newAnnotation,
      hasMoved,
      labelmap,
      segmentIndex,
      segmentsLocked,
    } = this.editData
    const { data } = toolData
    const { viewPlaneNormal, viewUp } = toolData.metadata

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
      segmentsLocked,
      viewPlaneNormal,
      viewUp,
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
    const { viewportUIDsToRender } = this.editData

    if (!viewportUIDsToRender.includes(viewport.uid)) {
      return
    }

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
    const { center, radius } = points
    const { canvas: circleCenterCanvas } = center

    // const circleCenterCanvas = viewport.worldToCanvas(circleCenterWorld)
    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed')
      return
    }

    const circleUID = '0'
    drawCircleSvg(
      svgDrawingHelper,
      this.name,
      annotationUID,
      circleUID,
      circleCenterCanvas,
      radius,
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
