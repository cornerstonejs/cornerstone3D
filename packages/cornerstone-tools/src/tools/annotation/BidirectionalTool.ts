import { BaseAnnotationTool } from '../base'
// ~~ VTK Viewport
import {
  Settings,
  getEnabledElement,
  getVolume,
  StackViewport,
  triggerEvent,
  eventTarget,
  Types,
  VIEWPORT_TYPE,
} from '@precisionmetrics/cornerstone-render'
import { getImageIdForTool, getToolStateForDisplay } from '../../util/planar'
import throttle from '../../util/throttle'
import {
  addToolState,
  getToolState,
  removeToolState,
} from '../../stateManagement/annotation/toolState'
import { isToolDataLocked } from '../../stateManagement/annotation/toolDataLocking'
import {
  drawLine as drawLineSvg,
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg'
import { vec2, vec3 } from 'gl-matrix'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import { indexWithinDimensions } from '../../util/vtkjs'
import lineSegment from '../../util/math/line'
import { getTextBoxCoordsCanvas } from '../../util/drawing'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import {
  ToolSpecificToolData,
  Point3,
  EventsTypes,
  ToolHandle,
  TextBoxHandle,
} from '../../types'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

interface BidirectionalSpecificToolData extends ToolSpecificToolData {
  data: {
    invalidated: boolean
    handles: {
      points: Point3[]
      activeHandleIndex: number | null
      textBox: {
        hasMoved: boolean
        worldPosition: Point3
        worldBoundingBox: {
          topLeft: Point3
          topRight: Point3
          bottomLeft: Point3
          bottomRight: Point3
        }
      }
    }
    cachedStats: any
    active: boolean
  }
}

export default class BidirectionalTool extends BaseAnnotationTool {
  touchDragCallback: any
  mouseDragCallback: any
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean
  preventHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Bidirectional',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    })

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    )
  }

  addNewMeasurement(evt: CustomEvent): BidirectionalSpecificToolData {
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
      const volumeUID = this.getTargetUID(viewport)
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

    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        toolName: this.name,
        label: '',
        referencedImageId,
      },
      data: {
        invalidated: true,
        handles: {
          points: [
            // long
            <Point3>[...worldPos],
            <Point3>[...worldPos],
            // short
            <Point3>[...worldPos],
            <Point3>[...worldPos],
          ],
          textBox: {
            hasMoved: false,
            worldPosition: <Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Point3>[0, 0, 0],
              topRight: <Point3>[0, 0, 0],
              bottomLeft: <Point3>[0, 0, 0],
              bottomRight: <Point3>[0, 0, 0],
            },
          },
          activeHandleIndex: null,
        },
        cachedStats: {},
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, BidirectionalTool)

    addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex: 1,
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

    return toolData
  }

  getHandleNearImagePoint = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const { points, textBox } = data.handles
    const { worldBoundingBox } = textBox

    if (worldBoundingBox) {
      const canvasBoundingBox = {
        topLeft: viewport.worldToCanvas(worldBoundingBox.topLeft),
        topRight: viewport.worldToCanvas(worldBoundingBox.topRight),
        bottomLeft: viewport.worldToCanvas(worldBoundingBox.bottomLeft),
        bottomRight: viewport.worldToCanvas(worldBoundingBox.bottomRight),
      }

      if (
        canvasCoords[0] >= canvasBoundingBox.topLeft[0] &&
        canvasCoords[0] <= canvasBoundingBox.bottomRight[0] &&
        canvasCoords[1] >= canvasBoundingBox.topLeft[1] &&
        canvasCoords[1] <= canvasBoundingBox.bottomRight[1]
      ) {
        data.handles.activeHandleIndex = null
        return textBox
      }
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      const toolDataCanvasCoordinate = viewport.worldToCanvas(point)

      const near =
        vec2.distance(canvasCoords, <vec2>toolDataCanvasCoordinate) < proximity

      if (near === true) {
        data.handles.activeHandleIndex = i
        return point
      }
    }

    data.handles.activeHandleIndex = null
  }

  pointNearTool = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { data } = toolData
    const { points } = data.handles

    // Check long axis
    let canavasPoint1 = viewport.worldToCanvas(points[0])
    let canavasPoint2 = viewport.worldToCanvas(points[1])

    let line = {
      start: {
        x: canavasPoint1[0],
        y: canavasPoint1[1],
      },
      end: {
        x: canavasPoint2[0],
        y: canavasPoint2[1],
      },
    }

    let distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    )

    if (distanceToPoint <= proximity) {
      return true
    }

    // Check short axis
    canavasPoint1 = viewport.worldToCanvas(points[2])
    canavasPoint2 = viewport.worldToCanvas(points[3])

    line = {
      start: {
        x: canavasPoint1[0],
        y: canavasPoint1[1],
      },
      end: {
        x: canavasPoint2[0],
        y: canavasPoint2[1],
      },
    }

    distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    )

    if (distanceToPoint <= proximity) {
      return true
    }
  }

  toolSelectedCallback = (evt, toolData, interactionType = 'mouse') => {
    const eventData = evt.detail
    const { element } = eventData

    const { data } = toolData

    data.active = true

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      movingTextBox: false,
    }

    this._activateModify(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    hideElementCursor(element)

    evt.preventDefault()
  }

  handleSelectedCallback = (
    evt: EventsTypes.NormalizedMouseEventType,
    toolData: ToolSpecificToolData,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void => {
    const eventData = evt.detail
    const { element } = eventData
    const { data } = toolData

    data.active = true

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
      this.name
    )

    hideElementCursor(element)

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex,
      movingTextBox,
    }
    this._activateModify(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  _mouseUpCallback = (evt) => {
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

    if (this.editData.handleIndex !== undefined) {
      const { points } = data.handles
      const firstLineSegmentLength = vec3.distance(points[0], points[1])
      const secondLineSegmentLength = vec3.distance(points[2], points[3])

      if (secondLineSegmentLength > firstLineSegmentLength) {
        // Switch points so [0,1] is the long axis and [2,3] is the short axis.

        const longAxis = [[...points[2]], [...points[3]]]

        const shortAxisPoint0 = [...points[0]]
        const shortAxisPoint1 = [...points[1]]

        // shortAxis[0->1] should be perpendicular (counter-clockwise) to longAxis[0->1]
        const longAxisVector = vec2.create()

        vec2.set(
          longAxisVector,
          longAxis[1][0] - longAxis[0][0],
          longAxis[1][1] - longAxis[1][0]
        )

        const counterClockWisePerpendicularToLongAxis = vec2.create()

        vec2.set(
          counterClockWisePerpendicularToLongAxis,
          -longAxisVector[1],
          longAxisVector[0]
        )

        const currentShortAxisVector = vec2.create()

        vec2.set(
          currentShortAxisVector,
          shortAxisPoint1[0] - shortAxisPoint0[0],
          shortAxisPoint1[1] - shortAxisPoint0[0]
        )

        let shortAxis

        if (
          vec2.dot(
            currentShortAxisVector,
            counterClockWisePerpendicularToLongAxis
          ) > 0
        ) {
          shortAxis = [shortAxisPoint0, shortAxisPoint1]
        } else {
          shortAxis = [shortAxisPoint1, shortAxisPoint0]
        }

        data.handles.points = [
          longAxis[0],
          longAxis[1],
          shortAxis[0],
          shortAxis[1],
        ]
      }
    }

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeToolState(element, toolData)
    }

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    this.editData = null
    this.isDrawing = false
  }

  _mouseDragDrawCallback = (evt) => {
    this.isDrawing = true

    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const { worldToCanvas } = viewport
    const { toolData, viewportUIDsToRender, handleIndex } = this.editData
    const { data } = toolData

    const worldPos = currentPoints.world

    // Update first move handle
    data.handles.points[handleIndex] = [...worldPos]

    const canvasCoordPoints = data.handles.points.map(worldToCanvas)

    const canvasCoords = {
      longLineSegment: {
        start: {
          x: canvasCoordPoints[0][0],
          y: canvasCoordPoints[0][1],
        },
        end: {
          x: canvasCoordPoints[1][0],
          y: canvasCoordPoints[1][1],
        },
      },
      shortLineSegment: {
        start: {
          x: canvasCoordPoints[2][0],
          y: canvasCoordPoints[2][1],
        },
        end: {
          x: canvasCoordPoints[3][0],
          y: canvasCoordPoints[3][1],
        },
      },
    }

    // ~~ calculate worldPos of our short axis handles
    // 1/3 distance between long points
    const dist = vec2.distance(canvasCoordPoints[0], canvasCoordPoints[1])

    const shortAxisDistFromCenter = dist / 3
    // Calculate long line's incline
    const dx =
      canvasCoords.longLineSegment.start.x - canvasCoords.longLineSegment.end.x
    const dy =
      canvasCoords.longLineSegment.start.y - canvasCoords.longLineSegment.end.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const vectorX = dx / length
    const vectorY = dy / length
    // middle point between long line segment's points
    const xMid =
      (canvasCoords.longLineSegment.start.x +
        canvasCoords.longLineSegment.end.x) /
      2
    const yMid =
      (canvasCoords.longLineSegment.start.y +
        canvasCoords.longLineSegment.end.y) /
      2
    // short points 1/3 distance from center of long points
    const startX = xMid + shortAxisDistFromCenter * vectorY
    const startY = yMid - shortAxisDistFromCenter * vectorX
    const endX = xMid - shortAxisDistFromCenter * vectorY
    const endY = yMid + shortAxisDistFromCenter * vectorX

    // Update perpendicular line segment's points
    data.handles.points[2] = viewport.canvasToWorld([startX, startY])
    data.handles.points[3] = viewport.canvasToWorld([endX, endY])

    data.invalidated = true
    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    this.editData.hasMoved = true
  }

  _mouseDragModifyCallback = (evt) => {
    this.isDrawing = true

    const eventData = evt.detail
    const { element } = eventData
    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement
    const { toolData, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData
    const { data } = toolData
    if (movingTextBox) {
      const { deltaPoints } = eventData
      const worldPosDelta = deltaPoints.world

      const { textBox } = data.handles
      const { worldPosition } = textBox

      worldPosition[0] += worldPosDelta[0]
      worldPosition[1] += worldPosDelta[1]
      worldPosition[2] += worldPosDelta[2]

      textBox.hasMoved = true
    } else if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventData
      const worldPosDelta = deltaPoints.world
      const points = data.handles.points

      points.forEach((point) => {
        point[0] += worldPosDelta[0]
        point[1] += worldPosDelta[1]
        point[2] += worldPosDelta[2]
      })
      data.invalidated = true
    } else {
      this._mouseDragModifyHandle(evt)
      data.invalidated = true
    }

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseDragModifyHandle = (evt) => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { toolData, handleIndex } = this.editData
    const { data } = toolData

    // Moving handle
    const worldPos = currentPoints.world
    const canvasCoordHandlesCurrent = [
      viewport.worldToCanvas(data.handles.points[0]),
      viewport.worldToCanvas(data.handles.points[1]),
      viewport.worldToCanvas(data.handles.points[2]),
      viewport.worldToCanvas(data.handles.points[3]),
    ]
    // Which line is long? Which line is short?
    const firstLineSegment = {
      start: {
        x: canvasCoordHandlesCurrent[0][0],
        y: canvasCoordHandlesCurrent[0][1],
      },
      end: {
        x: canvasCoordHandlesCurrent[1][0],
        y: canvasCoordHandlesCurrent[1][1],
      },
    }
    const secondLineSegment = {
      start: {
        x: canvasCoordHandlesCurrent[2][0],
        y: canvasCoordHandlesCurrent[2][1],
      },
      end: {
        x: canvasCoordHandlesCurrent[3][0],
        y: canvasCoordHandlesCurrent[3][1],
      },
    }

    // Handle we've selected's proposed point
    const proposedPoint = <Types.Point3>[...worldPos]
    const proposedCanvasCoord = viewport.worldToCanvas(proposedPoint)

    if (handleIndex === 0 || handleIndex === 1) {
      const fixedHandleIndex = handleIndex === 0 ? 1 : 0

      const fixedCanvasCoord = canvasCoordHandlesCurrent[fixedHandleIndex]

      // Check whether this
      const proposedFirstLineSegment = {
        start: {
          x: fixedCanvasCoord[0],
          y: fixedCanvasCoord[1],
        },
        end: {
          x: proposedCanvasCoord[0],
          y: proposedCanvasCoord[1],
        },
      }

      if (
        this._movingLongAxisWouldPutItThroughShortAxis(
          proposedFirstLineSegment,
          secondLineSegment
        )
      ) {
        return
      }

      // --> We need to preserve this distance
      const intersectionPoint = lineSegment.intersectLine(
        [secondLineSegment.start.x, secondLineSegment.start.y],
        [secondLineSegment.end.x, secondLineSegment.end.y],
        [firstLineSegment.start.x, firstLineSegment.start.y],
        [firstLineSegment.end.x, firstLineSegment.end.y]
      )

      const intersectionCoord = vec2.create()

      vec2.set(intersectionCoord, intersectionPoint[0], intersectionPoint[1])

      // 1. distance from intersection point to start handle?
      const distFromLeftHandle = vec2.distance(
        <vec2>canvasCoordHandlesCurrent[2],
        intersectionCoord
      )

      // 2. distance from intersection point to end handle?
      const distFromRightHandle = vec2.distance(
        <vec2>canvasCoordHandlesCurrent[3],
        intersectionCoord
      )

      // 3. distance from long's opposite handle and intersect point
      // Need new intersect x/y
      const distIntersectAndFixedPoint = Math.abs(
        vec2.distance(<vec2>fixedCanvasCoord, intersectionCoord)
      )

      // Find inclination of perpindicular
      // Should use proposed point to find new inclination
      const dx = fixedCanvasCoord[0] - proposedCanvasCoord[0]
      const dy = fixedCanvasCoord[1] - proposedCanvasCoord[1]
      const length = Math.sqrt(dx * dx + dy * dy)
      const vectorX = dx / length
      const vectorY = dy / length

      // Find new intersection point
      // --> fixedPoint, magnitude in perpendicular
      // minus if right
      // add if left
      const intersectX =
        fixedCanvasCoord[0] - distIntersectAndFixedPoint * vectorX
      const intersectY =
        fixedCanvasCoord[1] - distIntersectAndFixedPoint * vectorY

      // short points 1/4 distance from center of long points
      // Flip signs depending on grabbed handle
      const mod = handleIndex === 0 ? -1 : 1
      const leftX = intersectX + distFromLeftHandle * vectorY * mod
      const leftY = intersectY - distFromLeftHandle * vectorX * mod
      const rightX = intersectX - distFromRightHandle * vectorY * mod
      const rightY = intersectY + distFromRightHandle * vectorX * mod

      data.handles.points[handleIndex] = proposedPoint
      data.handles.points[2] = viewport.canvasToWorld([leftX, leftY])
      data.handles.points[3] = viewport.canvasToWorld([rightX, rightY])
    } else {
      // Translation manipulator
      const translateHandleIndex = handleIndex === 2 ? 3 : 2

      // does not rotate, but can translate entire line (other end of short)
      const proposedCanvasCoordPoint = {
        x: proposedCanvasCoord[0],
        y: proposedCanvasCoord[1],
      }
      const canvasCoordsCurrent = {
        longLineSegment: {
          start: firstLineSegment.start,
          end: firstLineSegment.end,
        },
        shortLineSegment: {
          start: secondLineSegment.start,
          end: secondLineSegment.end,
        },
      }

      // get incline of other line (should not change w/ this movement)
      const dx =
        canvasCoordsCurrent.longLineSegment.start.x -
        canvasCoordsCurrent.longLineSegment.end.x
      const dy =
        canvasCoordsCurrent.longLineSegment.start.y -
        canvasCoordsCurrent.longLineSegment.end.y
      const length = Math.sqrt(dx * dx + dy * dy)
      const vectorX = dx / length
      const vectorY = dy / length
      // Create a helper line to find the intesection point in the long line
      const highNumber = Number.MAX_SAFE_INTEGER
      // Get the multiplier
      // +1 or -1 depending on which perp end we grabbed (and if it was "fixed" end)
      const mod = handleIndex === 0 || handleIndex === 3 ? 1 : -1
      const multiplier = mod * highNumber
      const helperLine = {
        start: proposedCanvasCoordPoint, // could be start or end
        end: {
          x: proposedCanvasCoordPoint.x + vectorY * multiplier,
          y: proposedCanvasCoordPoint.y + vectorX * multiplier * -1,
        },
      }

      const newIntersectionPoint = lineSegment.intersectLine(
        [
          canvasCoordsCurrent.longLineSegment.start.x,
          canvasCoordsCurrent.longLineSegment.start.y,
        ],
        [
          canvasCoordsCurrent.longLineSegment.end.x,
          canvasCoordsCurrent.longLineSegment.end.y,
        ],
        [helperLine.start.x, helperLine.start.y],
        [helperLine.end.x, helperLine.end.y]
      )

      // short-circuit
      if (newIntersectionPoint === undefined) {
        return
      }

      // 1. distance from intersection point to start handle?
      const distFromTranslateHandle = vec2.distance(
        <vec2>canvasCoordHandlesCurrent[translateHandleIndex],
        [newIntersectionPoint[0], newIntersectionPoint[1]]
      )

      // isStart if index is 0 or 2
      const shortLineSegment = {
        start: {
          x: newIntersectionPoint[0] + vectorY * distFromTranslateHandle,
          y: newIntersectionPoint[1] + vectorX * distFromTranslateHandle * -1,
        },
        end: {
          x: newIntersectionPoint[0] + vectorY * distFromTranslateHandle * -1,
          y: newIntersectionPoint[1] + vectorX * distFromTranslateHandle,
        },
      }
      const translatedHandleCoords =
        translateHandleIndex === 2
          ? shortLineSegment.start
          : shortLineSegment.end

      data.handles.points[translateHandleIndex] = viewport.canvasToWorld([
        translatedHandleCoords.x,
        translatedHandleCoords.y,
      ])
      data.handles.points[handleIndex] = proposedPoint
    }
  }

  _movingLongAxisWouldPutItThroughShortAxis = (
    proposedFirstLineSegment,
    secondLineSegment
  ) => {
    const vectorInSecondLineDirection = vec2.create()

    vec2.set(
      vectorInSecondLineDirection,
      secondLineSegment.end.x - secondLineSegment.start.x,
      secondLineSegment.end.y - secondLineSegment.start.y
    )

    vec2.normalize(vectorInSecondLineDirection, vectorInSecondLineDirection)

    const extendedSecondLineSegment = {
      start: {
        x: secondLineSegment.start.x - vectorInSecondLineDirection[0] * 10,
        y: secondLineSegment.start.y - vectorInSecondLineDirection[1] * 10,
      },
      end: {
        x: secondLineSegment.end.x + vectorInSecondLineDirection[0] * 10,
        y: secondLineSegment.end.y + vectorInSecondLineDirection[1] * 10,
      },
    }

    // Add some buffer in the secondLineSegment when finding the proposedIntersectionPoint
    // Of points to stop us getting stack when rotating quickly.

    const proposedIntersectionPoint = lineSegment.intersectLine(
      [extendedSecondLineSegment.start.x, extendedSecondLineSegment.start.y],
      [extendedSecondLineSegment.end.x, extendedSecondLineSegment.end.y],
      [proposedFirstLineSegment.start.x, proposedFirstLineSegment.start.y],
      [proposedFirstLineSegment.end.x, proposedFirstLineSegment.end.y]
    )

    const wouldPutThroughShortAxis = !proposedIntersectionPoint

    return wouldPutThroughShortAxis
  }

  cancel(element) {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false
      this._deactivateDraw(element)
      this._deactivateModify(element)
      resetElementCursor(element)

      const { toolData, viewportUIDsToRender } = this.editData
      const { data } = toolData

      data.active = false
      data.handles.activeHandleIndex = null

      const enabledElement = getEnabledElement(element)
      const { renderingEngine } = enabledElement

      triggerAnnotationRenderForViewportUIDs(
        renderingEngine,
        viewportUIDsToRender
      )

      this.editData = null
      return toolData.metadata.toolDataUID
    }
  }

  _activateDraw = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragDrawCallback)
    element.addEventListener(EVENTS.MOUSE_MOVE, this._mouseDragDrawCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragDrawCallback)
  }

  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragDrawCallback)
    element.removeEventListener(EVENTS.MOUSE_MOVE, this._mouseDragDrawCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragDrawCallback)
  }

  _activateModify = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragModifyCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragModifyCallback)
  }

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(
      EVENTS.MOUSE_DRAG,
      this._mouseDragModifyCallback
    )
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(
      EVENTS.TOUCH_DRAG,
      this._mouseDragModifyCallback
    )
  }

  renderToolData(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void {
    const { viewport } = enabledElement
    const { element } = viewport
    let toolState = getToolState(enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(element, toolState)

    if (!toolState?.length) {
      return
    }

    const targetUID = this.getTargetUID(viewport)

    const renderingEngine = viewport.getRenderingEngine()

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as BidirectionalSpecificToolData
      const settings = Settings.getObjectSettings(toolData, BidirectionalTool)
      const annotationUID = toolData.metadata.toolDataUID
      const data = toolData.data
      const { points, activeHandleIndex } = data.handles
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const lineWidth = this.getStyle(settings, 'lineWidth', toolData)
      const lineDash = this.getStyle(settings, 'lineDash', toolData)
      const color = this.getStyle(settings, 'color', toolData)

      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {}

        this._calculateCachedStats(toolData, renderingEngine, enabledElement)
      } else if (data.invalidated) {
        this._throttledCalculateCachedStats(
          toolData,
          renderingEngine,
          enabledElement
        )
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

      const lineUID = '0'
      drawLineSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        lineUID,
        canvasCoordinates[0],
        canvasCoordinates[1],
        {
          color,
          lineDash,
          lineWidth,
        }
      )

      const secondLineUID = '1'
      drawLineSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        secondLineUID,
        canvasCoordinates[2],
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
      let canvasTextBoxCoords

      if (!data.handles.textBox.hasMoved) {
        canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates)

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords)
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      )

      const textBoxUID = '1'
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        this.getLinkedTextBoxStyle(settings, toolData)
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
    const { cachedStats } = data
    const { length, width } = cachedStats[targetUID]

    if (length === undefined) {
      return
    }

    // spaceBetweenSlices & pixelSpacing &
    // magnitude in each direction? Otherwise, this is "px"?
    const textLines = [
      `L: ${length.toFixed(2)} mm`,
      `W: ${width.toFixed(2)} mm`,
    ]

    return textLines
  }

  _getImageVolumeFromTargetUID(targetUID, renderingEngine) {
    let imageVolume, viewport
    if (targetUID.startsWith('stackTarget')) {
      const coloneIndex = targetUID.indexOf(':')
      const viewportUID = targetUID.substring(coloneIndex + 1)
      viewport = renderingEngine.getViewport(viewportUID)
      imageVolume = viewport.getImageData()
    } else {
      imageVolume = getVolume(targetUID)
    }

    return { imageVolume, viewport }
  }

  _calculateLength(pos1, pos2) {
    const dx = pos1[0] - pos2[0]
    const dy = pos1[1] - pos2[1]
    const dz = pos1[2] - pos2[2]

    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  _calculateCachedStats = (toolData, renderingEngine, enabledElement) => {
    const { data, metadata } = toolData
    const { viewportUID, renderingEngineUID } = enabledElement

    const worldPos1 = data.handles.points[0]
    const worldPos2 = data.handles.points[1]
    const worldPos3 = data.handles.points[2]
    const worldPos4 = data.handles.points[3]

    // https://github.com/Kitware/vtk-js/blob/b50fd091cb9b5b65981bc7c64af45e8f2472d7a1/Sources/Common/Core/Math/index.js#L331
    const { cachedStats } = data
    const targetUIDs = Object.keys(cachedStats)

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { imageVolume } = this._getImageVolumeFromTargetUID(
        targetUID,
        renderingEngine
      )

      const { imageData, dimensions } = imageVolume

      const dist1 = this._calculateLength(worldPos1, worldPos2)
      const dist2 = this._calculateLength(worldPos3, worldPos4)
      const length = dist1 > dist2 ? dist1 : dist2
      const width = dist1 > dist2 ? dist2 : dist1

      const index1 = imageData.worldToIndex(worldPos1)
      const index2 = imageData.worldToIndex(worldPos2)
      const index3 = imageData.worldToIndex(worldPos3)
      const index4 = imageData.worldToIndex(worldPos4)

      this._isInsideVolume(index1, index2, index3, index4, dimensions)
        ? (this.isHandleOutsideImage = false)
        : (this.isHandleOutsideImage = true)

      cachedStats[targetUID] = {
        length,
        width,
      }
    }

    data.invalidated = false

    // Dispatching measurement modified
    const eventType = EVENTS.MEASUREMENT_MODIFIED

    const eventDetail = {
      toolData,
      viewportUID,
      renderingEngineUID,
    }
    triggerEvent(eventTarget, eventType, eventDetail)
  }

  _isInsideVolume = (index1, index2, index3, index4, dimensions): boolean => {
    return (
      indexWithinDimensions(index1, dimensions) &&
      indexWithinDimensions(index2, dimensions) &&
      indexWithinDimensions(index3, dimensions) &&
      indexWithinDimensions(index4, dimensions)
    )
  }

  _clipIndexToVolume = (index, dimensions) => {
    for (let i = 0; i <= 2; i++) {
      if (index[i] < 0) {
        index[i] = 0
      } else if (index[i] >= dimensions[i]) {
        index[i] = dimensions[i] - 1
      }
    }
  }
}
