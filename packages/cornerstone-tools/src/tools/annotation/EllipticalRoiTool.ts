import { AnnotationTool } from '../base'

import {
  getEnabledElement,
  Settings,
  StackViewport,
  VolumeViewport,
  eventTarget,
  triggerEvent,
  cache,
  utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import throttle from '../../utilities/throttle'
import transformPhysicalToIndex from '../../utilities/transformPhysicalToIndex'
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState'
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking'
import {
  drawEllipse as drawEllipseSvg,
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg'
import { state } from '../../store'
import { Events } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../utilities/viewportFilters'
import { getTextBoxCoordsCanvas } from '../../utilities/drawing'
import getWorldWidthAndHeightFromTwoPoints from '../../utilities/planar/getWorldWidthAndHeightFromTwoPoints'
import {
  pointInEllipse,
  getCanvasEllipseCorners,
} from '../../utilities/math/ellipse'
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
import {
  AnnotationModifiedEventDetail,
  MouseDragEventType,
  MouseMoveEventType,
} from '../../types/EventTypes'
import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportUIDs'
import { pointInShapeCallback } from '../../utilities/'

export interface EllipticalRoiAnnotation extends Annotation {
  data: {
    handles: {
      points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3] // [bottom, top, left, right]
      activeHandleIndex: number | null
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
    }
    label: string
    cachedStats?: {
      [targetUID: string]: {
        Modality: string
        area: number
        max: number
        mean: number
        stdDev: number
      }
    }
  }
}

/**
 * EllipticalRoiTool let you draw annotations that measures the statistics
 * such as area, max, mean and stdDev of an elliptical region of interest.
 * You can use EllipticalRoiTool in all perpendicular views (axial, sagittal, coronal).
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference. Elliptical tool's text box lines are dynamically
 * generated based on the viewport's underlying Modality. For instance, if
 * the viewport is displaying CT, the text box will shown the statistics in Hounsfield units,
 * and if the viewport is displaying PET, the text box will show the statistics in
 * SUV units.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * ```js
 * cornerstoneTools.addTool(EllipticalRoiTool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupUID')
 *
 * toolGroup.addTool(EllipticalRoiTool.toolName)
 *
 * toolGroup.addViewport('viewportUID', 'renderingEngineUID')
 *
 * toolGroup.setToolActive(EllipticalRoiTool.toolName, {
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
export default class EllipticalRoiTool extends AnnotationTool {
  static toolName = 'EllipticalRoi'
  touchDragCallback: any
  mouseDragCallback: any
  _throttledCalculateCachedStats: any
  editData: {
    annotation: any
    viewportUIDsToRender: Array<string>
    handleIndex?: number
    movingTextBox?: boolean
    centerCanvas?: Array<number>
    canvasWidth?: number
    canvasHeight?: number
    originalHandleCanvas?: Array<number>
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  isDrawing: boolean
  isHandleOutsideImage = false

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
   * a EllipticalRoi Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): EllipticalRoiAnnotation => {
    const eventDetail = evt.detail
    const { currentPoints, element } = eventDetail
    const worldPos = currentPoints.world
    const canvasPos = currentPoints.canvas

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

    this.isDrawing = true

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: EllipticalRoiTool.toolName,
      },
      data: {
        label: '',
        handles: {
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
          points: [
            [...worldPos],
            [...worldPos],
            [...worldPos],
            [...worldPos],
          ] as [Types.Point3, Types.Point3, Types.Point3, Types.Point3],
          activeHandleIndex: null,
        },
        cachedStats: {},
      },
    }

    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, EllipticalRoiTool)

    addAnnotation(element, annotation)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      EllipticalRoiTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
      centerCanvas: canvasPos,
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

    return annotation
  }

  /**
   * It returns if the canvas point is near the provided annotation in the provided
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
    annotation: EllipticalRoiAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = annotation
    const { points } = data.handles

    // For some reason Typescript doesn't understand this, so we need to be
    // more specific about the type
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p)) as [
      Types.Point2,
      Types.Point2,
      Types.Point2,
      Types.Point2
    ]
    const canvasCorners = getCanvasEllipseCorners(canvasCoordinates)

    const [canvasPoint1, canvasPoint2] = canvasCorners

    const minorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) + proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) + proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) - proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) - proximity,
    }

    const majorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) - proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) - proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) + proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) + proximity,
    }

    const pointInMinorEllipse = this._pointInEllipseCanvas(
      minorEllipse,
      canvasCoords
    )
    const pointInMajorEllipse = this._pointInEllipseCanvas(
      majorEllipse,
      canvasCoords
    )

    if (pointInMajorEllipse && !pointInMinorEllipse) {
      return true
    }

    return false
  }

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: EllipticalRoiAnnotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    annotation.highlighted = true

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      EllipticalRoiTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
      movingTextBox: false,
    }

    hideElementCursor(element)

    this._activateModify(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  handleSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: EllipticalRoiAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void => {
    const eventDetail = evt.detail
    const { element } = eventDetail
    const { data } = annotation

    annotation.highlighted = true

    let movingTextBox = false
    let handleIndex

    let centerCanvas
    let canvasWidth
    let canvasHeight
    let originalHandleCanvas

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true
    } else {
      const { points } = data.handles
      const enabledElement = getEnabledElement(element)
      const { worldToCanvas } = enabledElement.viewport

      handleIndex = points.findIndex((p) => p === handle)

      const pointsCanvas = points.map(worldToCanvas)

      originalHandleCanvas = pointsCanvas[handleIndex]

      canvasWidth = Math.abs(pointsCanvas[2][0] - pointsCanvas[3][0])
      canvasHeight = Math.abs(pointsCanvas[0][1] - pointsCanvas[1][1])

      centerCanvas = [
        (pointsCanvas[2][0] + pointsCanvas[3][0]) / 2,
        (pointsCanvas[0][1] + pointsCanvas[1][1]) / 2,
      ]
    }

    // Find viewports to render on drag.
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      EllipticalRoiTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
      handleIndex,
      canvasWidth,
      canvasHeight,
      centerCanvas,
      originalHandleCanvas,
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
      return
    }

    annotation.highlighted = false
    data.handles.activeHandleIndex = null

    this._deactivateModify(element)
    this._deactivateDraw(element)

    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    this.editData = null
    this.isDrawing = false

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
  }

  _mouseDragDrawCallback = (evt: MouseMoveEventType | MouseDragEventType) => {
    this.isDrawing = true
    const eventDetail = evt.detail
    const { element } = eventDetail
    const { currentPoints } = eventDetail
    const currentCanvasPoints = currentPoints.canvas
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const { canvasToWorld } = viewport

    //////
    const { annotation, viewportUIDsToRender, centerCanvas } = this.editData
    const { data } = annotation

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1])

    // Todo: why bottom is -dY, it should be +dY
    const bottomCanvas = <Types.Point2>[centerCanvas[0], centerCanvas[1] - dY]
    const topCanvas = <Types.Point2>[centerCanvas[0], centerCanvas[1] + dY]
    const leftCanvas = <Types.Point2>[centerCanvas[0] - dX, centerCanvas[1]]
    const rightCanvas = <Types.Point2>[centerCanvas[0] + dX, centerCanvas[1]]

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ]

    annotation.invalidated = true

    this.editData.hasMoved = true

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseDragModifyCallback = (evt: MouseDragEventType) => {
    this.isDrawing = true
    const eventDetail = evt.detail
    const { element } = eventDetail

    const { annotation, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData
    const { data } = annotation

    if (movingTextBox) {
      const { deltaPoints } = eventDetail
      const worldPosDelta = deltaPoints.world

      const { textBox } = data.handles
      const { worldPosition } = textBox

      worldPosition[0] += worldPosDelta[0]
      worldPosition[1] += worldPosDelta[1]
      worldPosition[2] += worldPosDelta[2]

      textBox.hasMoved = true
    } else if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventDetail
      const worldPosDelta = deltaPoints.world

      const points = data.handles.points

      points.forEach((point) => {
        point[0] += worldPosDelta[0]
        point[1] += worldPosDelta[1]
        point[2] += worldPosDelta[2]
      })
      annotation.invalidated = true
    } else {
      this._dragHandle(evt)
      annotation.invalidated = true
    }

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _dragHandle = (evt) => {
    const eventDetail = evt.detail
    const { element } = eventDetail
    const enabledElement = getEnabledElement(element)
    const { canvasToWorld } = enabledElement.viewport

    const {
      annotation,
      canvasWidth,
      canvasHeight,
      handleIndex,
      centerCanvas,
      originalHandleCanvas,
    } = this.editData
    const { data } = annotation
    const { points } = data.handles

    // Move current point in that direction.
    // Move other points in opposite direction.

    const { currentPoints } = eventDetail
    const currentCanvasPoints = currentPoints.canvas

    if (handleIndex === 0 || handleIndex === 1) {
      // Dragging top or bottom point
      const dYCanvas = Math.abs(currentCanvasPoints[1] - centerCanvas[1])
      const canvasBottom = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] - dYCanvas,
      ]
      const canvasTop = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] + dYCanvas,
      ]

      points[0] = canvasToWorld(canvasBottom)
      points[1] = canvasToWorld(canvasTop)

      const dXCanvas = currentCanvasPoints[0] - originalHandleCanvas[0]
      const newHalfCanvasWidth = canvasWidth / 2 + dXCanvas
      const canvasLeft = <Types.Point2>[
        centerCanvas[0] - newHalfCanvasWidth,
        centerCanvas[1],
      ]
      const canvasRight = <Types.Point2>[
        centerCanvas[0] + newHalfCanvasWidth,
        centerCanvas[1],
      ]

      points[2] = canvasToWorld(canvasLeft)
      points[3] = canvasToWorld(canvasRight)
    } else {
      // Dragging left or right point
      const dXCanvas = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
      const canvasLeft = <Types.Point2>[
        centerCanvas[0] - dXCanvas,
        centerCanvas[1],
      ]
      const canvasRight = <Types.Point2>[
        centerCanvas[0] + dXCanvas,
        centerCanvas[1],
      ]

      points[2] = canvasToWorld(canvasLeft)
      points[3] = canvasToWorld(canvasRight)

      const dYCanvas = currentCanvasPoints[1] - originalHandleCanvas[1]
      const newHalfCanvasHeight = canvasHeight / 2 + dYCanvas
      const canvasBottom = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] - newHalfCanvasHeight,
      ]
      const canvasTop = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] + newHalfCanvasHeight,
      ]

      points[0] = canvasToWorld(canvasBottom)
      points[1] = canvasToWorld(canvasTop)
    }
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

  _activateModify = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragModifyCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragModifyCallback)
  }

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragModifyCallback
    )
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(
    //   Events.TOUCH_DRAG,
    //   this._mouseDragModifyCallback
    // )
  }

  _activateDraw = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragDrawCallback)
    element.addEventListener(Events.MOUSE_MOVE, this._mouseDragDrawCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragDrawCallback)
  }

  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragDrawCallback)
    element.removeEventListener(Events.MOUSE_MOVE, this._mouseDragDrawCallback)
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragDrawCallback)
  }

  /**
   * it is used to draw the ellipticalRoi annotation in each
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

    let annotations = getAnnotations(element, EllipticalRoiTool.toolName)

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

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as EllipticalRoiAnnotation
      const settings = Settings.getObjectSettings(annotation, EllipticalRoiTool)
      const annotationUID = annotation.annotationUID
      const data = annotation.data

      const { handles } = data
      const { points, activeHandleIndex } = handles

      const lineWidth = this.getStyle(settings, 'lineWidth', annotation)
      const lineDash = this.getStyle(settings, 'lineDash', annotation)
      const color = this.getStyle(settings, 'color', annotation)

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Types.Point2, Types.Point2, Types.Point2, Types.Point2]
      const canvasCorners = <Array<Types.Point2>>(
        getCanvasEllipseCorners(canvasCoordinates)
      )
      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {
          Modality: null,
          area: null,
          max: null,
          mean: null,
          stdDev: null,
        }

        this._calculateCachedStats(
          annotation,
          viewport,
          renderingEngine,
          enabledElement
        )
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          viewport,
          renderingEngine,
          enabledElement
        )

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related viewports data, so that
        // when scrolling to the related slice in which the tool were manipulated
        // we re-render the correct tool position. This is due to stackViewport
        // which doesn't have the full volume at each time, and we are only working
        // on one slice at a time.
        if (viewport instanceof VolumeViewport) {
          const { referencedImageId } = annotation.metadata

          // todo: this is not efficient, but necessary
          // invalidate all the relevant stackViewports if they are not
          // at the referencedImageId
          const viewports = renderingEngine.getViewports()
          viewports.forEach((vp) => {
            const stackTargetUID = this.getTargetUID(vp)
            // only delete the cachedStats for the stackedViewports if the tool
            // is dragged inside the volume and the stackViewports are not at the
            // referencedImageId for the tool
            if (
              vp instanceof StackViewport &&
              !vp.getCurrentImageId().includes(referencedImageId) &&
              data.cachedStats[stackTargetUID]
            ) {
              delete data.cachedStats[stackTargetUID]
            }
          })
        }
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

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
          EllipticalRoiTool.toolName,
          annotationUID,
          handleGroupUID,
          activeHandleCanvasCoords,
          {
            color,
          }
        )
      }

      const ellipseUID = '0'
      drawEllipseSvg(
        svgDrawingHelper,
        EllipticalRoiTool.toolName,
        annotationUID,
        ellipseUID,
        canvasCorners[0],
        canvasCorners[1],
        {
          color,
          lineDash,
          lineWidth,
        }
      )

      const textLines = this._getTextLines(data, targetUID)
      if (!textLines || textLines.length === 0) {
        continue
      }

      // Poor man's cached?
      let canvasTextBoxCoords

      if (!data.handles.textBox.hasMoved) {
        canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCorners)

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords)
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      )

      const textBoxUID = '1'
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        EllipticalRoiTool.toolName,
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

  _getTextLines = (data, targetUID) => {
    const cachedVolumeStats = data.cachedStats[targetUID]
    const { area, mean, stdDev, max, isEmptyArea, Modality } = cachedVolumeStats

    if (mean === undefined) {
      return
    }

    const textLines = []

    const areaLine = isEmptyArea
      ? `Area: Oblique not supported`
      : `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`
    let meanLine = `Mean: ${mean.toFixed(2)}`
    let maxLine = `Max: ${max.toFixed(2)}`
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`

    if (Modality === 'PT') {
      meanLine += ' SUV'
      maxLine += ' SUV'
      stdDevLine += ' SUV'
    } else if (Modality === 'CT') {
      meanLine += ' HU'
      maxLine += ' HU'
      stdDevLine += ' HU'
    } else {
      meanLine += ' MO'
      maxLine += ' MO'
      stdDevLine += ' MO'
    }

    textLines.push(areaLine)
    textLines.push(maxLine)
    textLines.push(meanLine)
    textLines.push(stdDevLine)

    return textLines
  }

  _calculateCachedStats = (
    annotation,
    viewport,
    renderingEngine,
    enabledElement
  ) => {
    const data = annotation.data
    const { viewportUID, renderingEngineUID } = enabledElement

    const { points } = data.handles

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
    const { viewPlaneNormal, viewUp } = viewport.getCamera()

    const [topLeftCanvas, bottomRightCanvas] = <Array<Types.Point2>>(
      getCanvasEllipseCorners(canvasCoordinates)
    )

    const topLeftWorld = viewport.canvasToWorld(topLeftCanvas)
    const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas)
    const { cachedStats } = data

    const targetUIDs = Object.keys(cachedStats)
    const worldPos1 = topLeftWorld
    const worldPos2 = bottomRightWorld

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { image } = this.getTargetUIDViewportAndImage(
        targetUID,
        renderingEngine
      )

      const { dimensions, imageData, metadata } = image

      const worldPos1Index = transformPhysicalToIndex(imageData, worldPos1)

      worldPos1Index[0] = Math.floor(worldPos1Index[0])
      worldPos1Index[1] = Math.floor(worldPos1Index[1])
      worldPos1Index[2] = Math.floor(worldPos1Index[2])

      const worldPos2Index = transformPhysicalToIndex(imageData, worldPos2)

      worldPos2Index[0] = Math.floor(worldPos2Index[0])
      worldPos2Index[1] = Math.floor(worldPos2Index[1])
      worldPos2Index[2] = Math.floor(worldPos2Index[2])

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      if (this._isInsideVolume(worldPos1Index, worldPos2Index, dimensions)) {
        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0])
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0])

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1])
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1])

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2])
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2])

        const boundsIJK = [
          [iMin, iMax],
          [jMin, jMax],
          [kMin, kMax],
        ] as [Types.Point2, Types.Point2, Types.Point2]

        const center = [
          (topLeftWorld[0] + bottomRightWorld[0]) / 2,
          (topLeftWorld[1] + bottomRightWorld[1]) / 2,
          (topLeftWorld[2] + bottomRightWorld[2]) / 2,
        ] as Types.Point3

        const ellipseObj = {
          center,
          xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
          yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
          zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
        }

        const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
          viewPlaneNormal,
          viewUp,
          worldPos1,
          worldPos2
        )
        const isEmptyArea = worldWidth === 0 && worldHeight === 0
        const area = Math.PI * (worldWidth / 2) * (worldHeight / 2)

        let count = 0
        let mean = 0
        let stdDev = 0
        let max = -Infinity

        const meanMaxCalculator = ({ value: newValue }) => {
          if (newValue > max) {
            max = newValue
          }

          mean += newValue
          count += 1
        }

        pointInShapeCallback(
          imageData,
          (pointLPS, pointIJK) => pointInEllipse(ellipseObj, pointLPS),
          meanMaxCalculator,
          boundsIJK
        )

        mean /= count

        const stdCalculator = ({ value }) => {
          const valueMinusMean = value - mean

          stdDev += valueMinusMean * valueMinusMean
        }

        pointInShapeCallback(
          imageData,
          (pointLPS, pointIJK) => pointInEllipse(ellipseObj, pointLPS),
          stdCalculator,
          boundsIJK
        )

        stdDev /= count
        stdDev = Math.sqrt(stdDev)

        cachedStats[targetUID] = {
          Modality: metadata.Modality,
          area,
          mean,
          max,
          stdDev,
          isEmptyArea,
        }
      } else {
        this.isHandleOutsideImage = true

        cachedStats[targetUID] = {
          Modality: metadata.Modality,
        }
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

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    )
  }

  /**
   * This is a temporary function to use the old ellipse's canvas-based
   * calculation for isPointNearTool, we should move the the world-based
   * calculation to the tool's isPointNearTool function.
   *
   * @param ellipse - The ellipse object
   * @param location - The location to check
   * @returns True if the point is inside the ellipse
   */
  _pointInEllipseCanvas(ellipse, location: Types.Point2): boolean {
    const xRadius = ellipse.width / 2
    const yRadius = ellipse.height / 2

    if (xRadius <= 0.0 || yRadius <= 0.0) {
      return false
    }

    const center = [ellipse.left + xRadius, ellipse.top + yRadius]
    const normalized = [location[0] - center[0], location[1] - center[1]]

    const inEllipse =
      (normalized[0] * normalized[0]) / (xRadius * xRadius) +
        (normalized[1] * normalized[1]) / (yRadius * yRadius) <=
      1.0

    return inEllipse
  }
}
