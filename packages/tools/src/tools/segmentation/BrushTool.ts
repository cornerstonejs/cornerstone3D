import { cache, getEnabledElement, StackViewport } from '@cornerstonejs/core'

import type { Types } from '@cornerstonejs/core'
import type { PublicToolProps, ToolProps, EventTypes } from '../../types'
import { BaseTool } from '../base'

import { fillInsideCircle } from './strategies/fillCircle'
import { Events } from '../../enums'
import { drawCircle as drawCircleSvg } from '../../drawingSvg'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'

import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportIds'
import {
  segmentationColor,
  segmentLocking,
  segmentIndex as segmentIndexController,
  state as segmentationState,
  activeSegmentation,
} from '../../stateManagement/segmentation'

/**
 * @public
 */
export default class BrushTool extends BaseTool {
  static toolName = 'Brush'
  private _editData: {
    toolData: any
    segmentation: any
    segmentationId: string
    segmentIndex: number
    segmentationRepresentationUID: string
    segmentsLocked: number[]
    segmentColor: [number, number, number, number]
    viewportIdsToRender: string[]
    centerCanvas?: Array<number>
  } | null
  private _isDrawing: boolean

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE: fillInsideCircle,
          // ERASE_INSIDE: eraseInsideCircle,
        },
        defaultStrategy: 'FILL_INSIDE',
        activeStrategy: 'FILL_INSIDE',
        brushSize: 25,
      },
    }
  ) {
    super(toolProps, defaultToolProps)
  }

  addNewAnnotation = (evt: EventTypes.MouseDownActivateEventType): void => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const canvasPos = currentPoints.canvas

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this._isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera
    const toolGroupId = this.toolGroupId

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId)
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using the brush tool'
      )
    }

    const { segmentationRepresentationUID, segmentationId, type } =
      activeSegmentationRepresentation
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(toolGroupId)
    const segmentsLocked =
      segmentLocking.getSegmentsLockedForSegmentation(segmentationId)
    const segmentColor = segmentationColor.getColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    )

    const { representations } =
      segmentationState.getSegmentation(segmentationId)

    // Todo: are we going to support contour editing with this tool?
    const { volumeId } = representations[type]
    const segmentation = cache.getVolume(volumeId)

    // Todo: Used for drawing the svg only, we might not need it at all
    const toolData = {
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: BrushTool.toolName,
        segmentColor,
      },
      data: {
        invalidated: true,
        handles: {
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
        },
        cachedStats: {},
      },
    }

    const viewportIdsToRender = [viewport.id]

    this._editData = {
      toolData,
      segmentation,
      centerCanvas: canvasPos,
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      segmentsLocked,
      segmentColor,
      viewportIdsToRender,
    }

    this._activateDraw(element)

    hideElementCursor(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportUIDs(renderingEngine, viewportIdsToRender)
  }

  private _mouseDragCallback = (evt: EventTypes.MouseDragEventType): void => {
    this._isDrawing = true
    const brushSize = this.configuration.brushSize
    const eventData = evt.detail
    const { element } = eventData
    const { currentPoints } = eventData
    const currentCanvasPoints = currentPoints.canvas
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const { canvasToWorld } = viewport

    //////
    const {
      segmentation,
      segmentIndex,
      segmentsLocked,
      segmentationId,
      segmentationRepresentationUID,
      toolData,
      viewportIdsToRender,
    } = this._editData
    const { viewPlaneNormal, viewUp } = toolData.metadata
    const { data } = toolData

    const centerCanvas = currentCanvasPoints

    // Center of circle in canvas Coordinates

    const radius = brushSize

    const bottomCanvas: Types.Point2 = [
      centerCanvas[0],
      centerCanvas[1] + radius,
    ]
    const topCanvas: Types.Point2 = [centerCanvas[0], centerCanvas[1] - radius]
    const leftCanvas: Types.Point2 = [centerCanvas[0] - radius, centerCanvas[1]]
    const rightCanvas: Types.Point2 = [
      centerCanvas[0] + radius,
      centerCanvas[1],
    ]

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ]

    data.invalidated = true

    triggerAnnotationRenderForViewportUIDs(renderingEngine, viewportIdsToRender)

    const operationData = {
      points: data.handles.points,
      volume: segmentation, // todo: just pass the segmentationId instead
      segmentIndex,
      segmentsLocked,
      viewPlaneNormal,
      toolGroupId: this.toolGroupId,
      segmentationId,
      segmentationRepresentationUID,
      viewUp,
    }

    this.applyActiveStrategy(enabledElement, operationData)
  }

  private _mouseUpCallback = (evt: EventTypes.MouseUpEventType): void => {
    const eventData = evt.detail
    const { element } = eventData

    const {
      toolData,
      segmentation,
      segmentIndex,
      segmentsLocked,
      segmentationId,
      segmentationRepresentationUID,
    } = this._editData
    const { data } = toolData
    const { viewPlaneNormal, viewUp } = toolData.metadata

    this._deactivateDraw(element)

    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    this._editData = null
    this._isDrawing = false

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet')
    }

    const operationData = {
      points: data.handles.points,
      volume: segmentation,
      segmentIndex,
      segmentsLocked,
      viewPlaneNormal,
      toolGroupId: this.toolGroupId,
      segmentationId,
      segmentationRepresentationUID,
      viewUp,
    }

    this.applyActiveStrategy(enabledElement, operationData)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event propagation.
   */
  private _activateDraw = (element: HTMLElement): void => {
    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    //element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    //element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  private _deactivateDraw = (element: HTMLElement): void => {
    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    //element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    //element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void {
    if (!this._editData) {
      return
    }

    const { viewport } = enabledElement
    const { viewportIdsToRender } = this._editData

    if (!viewportIdsToRender.includes(viewport.id)) {
      return
    }

    const { toolData } = this._editData

    // Todo: rectangle colro based on segment index
    const toolMetadata = toolData.metadata
    const annotationUID = toolMetadata.toolDataUID

    const data = toolData.data
    const { points } = data.handles
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

    const bottom = canvasCoordinates[0]
    const top = canvasCoordinates[1]

    const center = [
      Math.floor((bottom[0] + top[0]) / 2),
      Math.floor((bottom[1] + top[1]) / 2),
    ]

    const radius = Math.abs(bottom[1] - Math.floor((bottom[1] + top[1]) / 2))

    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed')
      return
    }

    const circleUID = '0'
    drawCircleSvg(
      svgDrawingHelper,
      BrushTool.toolName,
      annotationUID,
      circleUID,
      center as Types.Point2,
      radius,
      {
        color,
      }
    )
  }
}
