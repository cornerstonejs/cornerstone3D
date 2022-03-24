import { AnnotationTool } from '../base'

import {
  getEnabledElement,
  cache,
  Settings,
  StackViewport,
  VolumeViewport,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'

import throttle from '../../utilities/throttle'
import transformPhysicalToIndex from '../../utilities/transformPhysicalToIndex'
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement'
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking'

import {
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { state } from '../../store'
import { Events } from '../../enums'
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters'
import rectangle from '../../utilities/math/rectangle'
import { getTextBoxCoordsCanvas } from '../../utilities/drawing'
import getWorldWidthAndHeightFromCorners from '../../utilities/planar/getWorldWidthAndHeightFromCorners'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds'

import {
  Annotation,
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  ToolProps,
  PublicToolProps,
  InteractionTypes,
} from '../../types'
import { AnnotationModifiedEventDetail } from '../../types/EventTypes'

interface RectangleRoiCachedStats {
  [targetUID: string]: {
    Modality: string
    area: number
    max: number
    mean: number
    stdDev: number
  }
}

/**
 * RectangleRoiAnnotation let you draw annotations that measures the statistics
 * such as area, max, mean and stdDev of a Rectangular region of interest.
 * You can use RectangleRoiAnnotation in all perpendicular views (axial, sagittal, coronal).
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference. RectangleRoi tool's text box lines are dynamically
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
 * cornerstoneTools.addTool(RectangleRoiAnnotation)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupUID')
 *
 * toolGroup.addTool(RectangleRoiAnnotation.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineUID')
 *
 * toolGroup.setToolActive(RectangleRoiAnnotation.toolName, {
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
export interface RectangleRoiAnnotation extends Annotation {
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
    cachedStats?:
      | RectangleRoiCachedStats
      | {
          projectionPoints?: Types.Point3[]
          projectionPointsImageIds?: string[]
        }
  }
}

export default class RectangleRoiTool extends AnnotationTool {
  static toolName = 'RectangleRoi'

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
   * a RectangleRoi Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): RectangleRoiAnnotation => {
    const eventDetail = evt.detail
    const { currentPoints, element } = eventDetail
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
      invalidated: true,
      highlighted: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: RectangleRoiTool.toolName,
      },
      data: {
        label: '',
        handles: {
          points: [
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
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
          activeHandleIndex: null,
        },
        cachedStats: {},
      },
    }

    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, RectangleRoiTool)

    addAnnotation(element, annotation)

    const viewportUIDsToRender = getViewportIdsWithToolToRender(
      element,
      RectangleRoiTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    hideElementCursor(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportUIDsToRender)

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
    annotation: RectangleRoiAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = annotation
    const { points } = data.handles

    const canvasPoint1 = viewport.worldToCanvas(points[0])
    const canvasPoint2 = viewport.worldToCanvas(points[3])

    const rect = this._getRectangleImageCoordinates([
      canvasPoint1,
      canvasPoint2,
    ])

    const point = [canvasCoords[0], canvasCoords[1]]
    const { left, top, width, height } = rect

    const distanceToPoint = rectangle.distanceToPoint(
      [left, top, width, height],
      point as Types.Point2
    )

    if (distanceToPoint <= proximity) {
      return true
    }

    return false
  }

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: RectangleRoiAnnotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    annotation.highlighted = true

    const viewportUIDsToRender = getViewportIdsWithToolToRender(
      element,
      RectangleRoiTool.toolName
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

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportUIDsToRender)

    evt.preventDefault()
  }

  handleSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: RectangleRoiAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void => {
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
    const viewportUIDsToRender = getViewportIdsWithToolToRender(
      element,
      RectangleRoiTool.toolName
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

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportUIDsToRender)

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

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportUIDsToRender)
  }

  _mouseDragCallback = (
    evt: EventTypes.MouseMoveEventType | EventTypes.MouseDragEventType
  ) => {
    this.isDrawing = true

    const eventDetail = evt.detail
    const { element } = eventDetail

    const { annotation, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData
    const { data } = annotation

    if (movingTextBox) {
      // Drag mode - Move the text boxes world position
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail
      const worldPosDelta = deltaPoints.world

      const { textBox } = data.handles
      const { worldPosition } = textBox

      worldPosition[0] += worldPosDelta[0]
      worldPosition[1] += worldPosDelta[1]
      worldPosition[2] += worldPosDelta[2]

      textBox.hasMoved = true
    } else if (handleIndex === undefined) {
      // Drag mode - Moving tool, so move all points by the world points delta
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail
      const worldPosDelta = deltaPoints.world

      const { points } = data.handles

      points.forEach((point) => {
        point[0] += worldPosDelta[0]
        point[1] += worldPosDelta[1]
        point[2] += worldPosDelta[2]
      })
      annotation.invalidated = true
    } else {
      // Moving handle.
      const { currentPoints } = eventDetail
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

          bottomLeftCanvas = <Types.Point2>[
            topLeftCanvas[0],
            bottomRightCanvas[1],
          ]
          topRightCanvas = <Types.Point2>[
            bottomRightCanvas[0],
            topLeftCanvas[1],
          ]

          bottomLeftWorld = canvasToWorld(bottomLeftCanvas)
          topRightWorld = canvasToWorld(topRightCanvas)

          points[0] = bottomLeftWorld
          points[3] = topRightWorld

          break
      }
      annotation.invalidated = true
    }

    this.editData.hasMoved = true

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportUIDsToRender)
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

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportUIDsToRender
      )

      this.editData = null
      return annotation.annotationUID
    }
  }
  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateDraw = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_MOVE, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_MOVE, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateModify = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Remove event handlers for the modify event loop, and enable default event propagation.
   */
  _deactivateModify = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * it is used to draw the rectangleRoi annotation in each
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

    let annotations = getAnnotations(element, RectangleRoiTool.toolName)

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
      const annotation = annotations[i] as RectangleRoiAnnotation
      const settings = Settings.getObjectSettings(annotation, RectangleRoiTool)
      const annotationUID = annotation.annotationUID

      const data = annotation.data
      const { points, activeHandleIndex } = data.handles
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const lineWidth = this.getStyle(settings, 'lineWidth', annotation)
      const lineDash = this.getStyle(settings, 'lineDash', annotation)
      const color = this.getStyle(settings, 'color', annotation)

      const { viewPlaneNormal, viewUp } = viewport.getCamera()

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
          viewPlaneNormal,
          viewUp,
          renderingEngine,
          enabledElement
        )
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          viewPlaneNormal,
          viewUp,
          renderingEngine,
          enabledElement
        )

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related stackViewports data if
        // they are not at the referencedImageId, so that
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
          RectangleRoiTool.toolName,
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
        RectangleRoiTool.toolName,
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

      const textLines = this._getTextLines(data, targetUID)
      if (!textLines || textLines.length === 0) {
        continue
      }

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
        RectangleRoiTool.toolName,
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

  _getRectangleImageCoordinates = (
    points: Array<Types.Point2>
  ): {
    left: number
    top: number
    width: number
    height: number
  } => {
    const [point0, point1] = points

    return {
      left: Math.min(point0[0], point1[0]),
      top: Math.min(point0[1], point1[1]),
      width: Math.abs(point0[0] - point1[0]),
      height: Math.abs(point0[1] - point1[1]),
    }
  }

  /**
   * _getTextLines - Returns the Area, mean and std deviation of the area of the
   * target volume enclosed by the rectangle.
   *
   * @param data - The annotation tool-specific data.
   * @param targetUID - The volumeUID of the volume to display the stats for.
   */
  _getTextLines = (data, targetUID: string) => {
    const cachedVolumeStats = data.cachedStats[targetUID]
    const { area, mean, max, stdDev, Modality } = cachedVolumeStats

    if (mean === undefined) {
      return
    }

    const textLines = []

    const areaLine = `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`
    let meanLine = `Mean: ${mean.toFixed(2)}`
    let maxLine = `Max: ${max.toFixed(2)}`
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`

    // Give appropriate units for the modality.
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

  /**
   * _calculateCachedStats - For each volume in the frame of reference that a
   * tool instance in particular viewport defines as its target volume, find the
   * volume coordinates (i,j,k) being probed by the two corners. One of i,j or k
   * will be constant across the two points. In the other two directions iterate
   * over the voxels and calculate the first and second-order statistics.
   *
   * @param data - The annotation tool-specific data.
   * @param viewPlaneNormal - The normal vector of the camera.
   * @param viewUp - The viewUp vector of the camera.
   */
  _calculateCachedStats = (
    annotation,
    viewPlaneNormal,
    viewUp,
    renderingEngine,
    enabledElement
  ) => {
    const { data } = annotation
    const { viewportId, renderingEngineUID } = enabledElement

    const worldPos1 = data.handles.points[0]
    const worldPos2 = data.handles.points[3]
    const { cachedStats } = data

    const targetUIDs = Object.keys(cachedStats)

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { image } = this.getTargetUIDViewportAndImage(
        targetUID,
        renderingEngine
      )

      const { dimensions, scalarData, imageData, metadata } = image

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
        this.isHandleOutsideImage = false

        // Calculate index bounds to iterate over

        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0])
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0])

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1])
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1])

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2])
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2])

        const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
          viewPlaneNormal,
          viewUp,
          worldPos1,
          worldPos2
        )

        const area = worldWidth * worldHeight

        let count = 0
        let mean = 0
        let stdDev = 0
        let max = -Infinity

        const yMultiple = dimensions[0]
        const zMultiple = dimensions[0] * dimensions[1]

        //Todo: this can be replaced by pointInShapeCallback....
        // This is a triple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i]

              if (value > max) {
                max = value
              }

              count++
              mean += value
            }
          }
        }

        mean /= count

        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i]

              const valueMinusMean = value - mean

              stdDev += valueMinusMean * valueMinusMean
            }
          }
        }

        stdDev /= count
        stdDev = Math.sqrt(stdDev)

        cachedStats[targetUID] = {
          Modality: metadata.Modality,
          area,
          mean,
          stdDev,
          max,
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
      viewportId,
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
}
