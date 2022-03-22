import { Events } from '../../enums'
import {
  getEnabledElement,
  cache,
  StackViewport,
  Settings,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { AnnotationTool } from '../base'
import throttle from '../../utilities/throttle'
import transformPhysicalToIndex from '../../utilities/transformPhysicalToIndex'
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState'
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking'
import { lineSegment } from '../../utilities/math'

import {
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg'
import { state } from '../../store'
import { getViewportUIDsWithToolToRender } from '../../utilities/viewportFilters'
import { getTextBoxCoordsCanvas } from '../../utilities/drawing'
import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportUIDs'
import { AnnotationModifiedEventDetail } from '../../types/EventTypes'

import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'

import {
  Annotation,
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
} from '../../types'

interface LengthAnnotation extends Annotation {
  data: {
    handles: {
      points: Types.Point3[]
      activeHandleIndex: number | null
      textBox: {
        hasMoved: boolean
        worldPosition: Types.Point3
        worldBoundingBox: {
          topLeft: Types.Point3
          topRight: Types.Point3
          bottomLeft: Types.Point3
          bottomRight: Types.Point3
        }
      }
    }
    label: string
    cachedStats: {
      [targetUID: string]: {
        length: number
      }
    }
  }
}

/**
 * LengthTool let you draw annotations that measures the length of two drawing
 * points on a slice. You can use the LengthTool in all imaging planes even in oblique
 * reconstructed planes. Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * ```js
 * cornerstoneTools.addTool(LengthTool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupUID')
 *
 * toolGroup.addTool(LengthTool.toolName)
 *
 * toolGroup.addViewport('viewportUID', 'renderingEngineUID')
 *
 * toolGroup.setToolActive(LengthTool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.

 */

class LengthTool extends AnnotationTool {
  static toolName = 'Length'

  public touchDragCallback: any
  public mouseDragCallback: any
  _throttledCalculateCachedStats: any
  editData: {
    annotation: any
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox?: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps)

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    )
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Length Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): LengthAnnotation => {
    const eventDetail = evt.detail
    const { currentPoints, element } = eventDetail
    const worldPos = currentPoints.world
    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    hideElementCursor(element)
    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    // TODO: what do we do here? this feels wrong
    let referencedImageId
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId()
    } else {
      const volumeUID = this.getTargetUID(viewport)
      const imageVolume = cache.getVolume(volumeUID)
      referencedImageId = csUtils.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal,
        viewUp
      )
    }

    if (referencedImageId) {
      const colonIndex = referencedImageId.indexOf(':')
      referencedImageId = referencedImageId.substring(colonIndex + 1)
    }

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: LengthTool.toolName,
      },
      data: {
        handles: {
          points: [<Types.Point3>[...worldPos], <Types.Point3>[...worldPos]],
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: <Types.Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Types.Point3>[0, 0, 0],
              topRight: <Types.Point3>[0, 0, 0],
              bottomLeft: <Types.Point3>[0, 0, 0],
              bottomRight: <Types.Point3>[0, 0, 0],
            },
          },
        },
        label: '',
        cachedStats: {},
      },
    }

    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, LengthTool)

    addAnnotation(element, annotation)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      LengthTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
      handleIndex: 1,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    return annotation
  }

  /**
   * It returns if the canvas point is near the provided length annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLElement,
    annotation: LengthAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { data } = annotation
    const [point1, point2] = data.handles.points
    const canvasPoint1 = viewport.worldToCanvas(point1)
    const canvasPoint2 = viewport.worldToCanvas(point2)

    const line = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    }

    const distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    )

    if (distanceToPoint <= proximity) {
      return true
    }

    return false
  }

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: LengthAnnotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    annotation.highlighted = true

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      LengthTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
      movingTextBox: false,
    }

    this._activateModify(element)

    hideElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  handleSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    annotation: LengthAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void {
    const eventDetail = evt.detail
    const { element } = eventDetail
    const { data } = annotation

    annotation.highlighted = true

    let movingTextBox = false
    let handleIndex

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle)
    }

    // Find viewports to render on drag.
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      LengthTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
      handleIndex,
      movingTextBox,
    }
    this._activateModify(element)

    hideElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    const { annotation, viewportUIDsToRender, newAnnotation, hasMoved } =
      this.editData
    const { data } = annotation

    if (newAnnotation && !hasMoved) {
      // when user starts the drawing by click, and moving the mouse, instead
      // of click and drag
      return
    }

    annotation.highlighted = false
    data.handles.activeHandleIndex = null

    this._deactivateModify(element)
    this._deactivateDraw(element)
    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(element, annotation.annotationUID)
    }

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    this.editData = null
    this.isDrawing = false
  }

  _mouseDragCallback = (
    evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
  ) => {
    this.isDrawing = true
    const eventDetail = evt.detail
    const { element } = eventDetail

    const { annotation, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData
    const { data } = annotation

    if (movingTextBox) {
      // Drag mode - moving text box
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail
      const worldPosDelta = deltaPoints.world

      const { textBox } = data.handles
      const { worldPosition } = textBox

      worldPosition[0] += worldPosDelta[0]
      worldPosition[1] += worldPosDelta[1]
      worldPosition[2] += worldPosDelta[2]

      textBox.hasMoved = true
    } else if (handleIndex === undefined) {
      // Drag mode - moving handle
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail
      const worldPosDelta = deltaPoints.world

      const points = data.handles.points

      points.forEach((point) => {
        point[0] += worldPosDelta[0]
        point[1] += worldPosDelta[1]
        point[2] += worldPosDelta[2]
      })
      annotation.invalidated = true
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail
      const worldPos = currentPoints.world

      data.handles.points[handleIndex] = [...worldPos]
      annotation.invalidated = true
    }

    this.editData.hasMoved = true

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  cancel = (element: HTMLElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false
      this._deactivateDraw(element)
      this._deactivateModify(element)
      resetElementCursor(element)

      const { annotation, viewportUIDsToRender } = this.editData
      const { data } = annotation

      annotation.highlighted = false
      data.handles.activeHandleIndex = null

      const enabledElement = getEnabledElement(element)
      const { renderingEngine } = enabledElement

      triggerAnnotationRenderForViewportUIDs(
        renderingEngine,
        viewportUIDsToRender
      )

      this.editData = null
      return annotation.annotationUID
    }
  }

  _activateModify = (element: HTMLElement) => {
    state.isInteractingWithTool = true

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateModify = (element: HTMLElement) => {
    state.isInteractingWithTool = false

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  _activateDraw = (element: HTMLElement) => {
    state.isInteractingWithTool = true

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_MOVE, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateDraw = (element: HTMLElement) => {
    state.isInteractingWithTool = false

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_MOVE, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * it is used to draw the length annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    const { viewport } = enabledElement
    const { element } = viewport

    let annotations = getAnnotations(element, LengthTool.toolName)

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
    if (!annotations?.length) {
      return
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    )

    if (!annotations?.length) {
      return
    }

    const targetUID = this.getTargetUID(viewport)
    const renderingEngine = viewport.getRenderingEngine()

    // Draw SVG
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as LengthAnnotation
      const settings = Settings.getObjectSettings(annotation, LengthTool)
      const annotationUID = annotation.annotationUID
      const data = annotation.data
      const { points, activeHandleIndex } = data.handles
      const lineWidth = this.getStyle(settings, 'lineWidth', annotation)
      const lineDash = this.getStyle(settings, 'lineDash', annotation)
      const color = this.getStyle(settings, 'color', annotation)

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

      let activeHandleCanvasCoords

      if (
        !isAnnotationLocked(annotation) &&
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
          LengthTool.toolName,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color,
            lineDash,
            lineWidth,
          }
        )
      }

      const lineUID = '1'
      drawLineSvg(
        svgDrawingHelper,
        LengthTool.toolName,
        annotationUID,
        lineUID,
        canvasCoordinates[0],
        canvasCoordinates[1],
        {
          color,
          width: lineWidth,
        }
      )

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT
      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {
          length: null,
        }

        this._calculateCachedStats(annotation, renderingEngine, enabledElement)
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          renderingEngine,
          enabledElement
        )
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

      const textLines = this._getTextLines(data, targetUID)

      // Need to update to sync w/ annotation while unlinked/not moved
      if (!data.handles.textBox.hasMoved) {
        const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates)

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords)
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      )

      const textBoxUID = '1'
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        LengthTool.toolName,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        this.getLinkedTextBoxStyle(settings, annotation)
      )

      const { x: left, y: top, width, height } = boundingBox

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([left, top]),
        topRight: viewport.canvasToWorld([left + width, top]),
        bottomLeft: viewport.canvasToWorld([left, top + height]),
        bottomRight: viewport.canvasToWorld([left + width, top + height]),
      }
    }
  }

  // text line for the current active length annotation
  _getTextLines(data, targetUID) {
    const cachedVolumeStats = data.cachedStats[targetUID]
    const { length } = cachedVolumeStats

    if (length === undefined) {
      return
    }

    // spaceBetweenSlices & pixelSpacing &
    // magnitude in each direction? Otherwise, this is "px"?
    const textLines = [`${length.toFixed(2)} mm`]

    return textLines
  }

  _calculateLength(pos1, pos2) {
    const dx = pos1[0] - pos2[0]
    const dy = pos1[1] - pos2[1]
    const dz = pos1[2] - pos2[2]

    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  _calculateCachedStats(annotation, renderingEngine, enabledElement) {
    const data = annotation.data
    const { viewportUID, renderingEngineUID } = enabledElement

    const worldPos1 = data.handles.points[0]
    const worldPos2 = data.handles.points[1]
    const { cachedStats } = data
    const targetUIDs = Object.keys(cachedStats)

    // TODO clean up, this doesn't need a length per volume, it has no stats derived from volumes.

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { image } = this.getTargetUIDViewportAndImage(
        targetUID,
        renderingEngine
      )

      const { imageData, dimensions } = image

      const length = this._calculateLength(worldPos1, worldPos2)

      const index1 = transformPhysicalToIndex(imageData, worldPos1)
      const index2 = transformPhysicalToIndex(imageData, worldPos2)

      this._isInsideVolume(index1, index2, dimensions)
        ? (this.isHandleOutsideImage = false)
        : (this.isHandleOutsideImage = true)

      // TODO -> Do we instead want to clip to the bounds of the volume and only include that portion?
      // Seems like a lot of work for an unrealistic case. At the moment bail out of stat calculation if either
      // corner is off the canvas.

      // todo: add insideVolume calculation, for removing tool if outside
      cachedStats[targetUID] = {
        length,
      }
    }

    annotation.invalidated = false

    // Dispatching annotation modified
    const eventType = Events.ANNOTATION_MODIFIED

    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportUID,
      renderingEngineUID,
    }
    triggerEvent(eventTarget, eventType, eventDetail)

    return cachedStats
  }

  _isInsideVolume(index1, index2, dimensions) {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    )
  }
}

export default LengthTool
