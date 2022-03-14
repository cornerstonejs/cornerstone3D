import {
  Utilities,
  getEnabledElement,
  VolumeViewport,
  Settings,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { vec4, vec2 } from 'gl-matrix'

import BaseTool from './BaseTool'
import { isToolDataLocked } from '../../stateManagement/annotation/toolDataLocking'
import { getViewportSpecificStateManager } from '../../stateManagement/annotation/toolState'
import {
  ToolSpecificToolData,
  ToolSpecificToolState,
  EventTypes,
  ToolHandle,
  InteractionTypes,
} from '../../types'
import triggerAnnotationRender from '../../util/triggerAnnotationRender'
import filterToolStateForDisplay from '../../util/planar/filterToolStateForDisplay'
import { getStyleProperty } from '../../stateManagement/annotation/toolStyle'
import { getToolDataStyleState } from '../../stateManagement/annotation/toolDataStyle'

/**
 * Abstract class for tools which create and display annotations on the
 * cornerstone3D canvas. In addition, it provides a base class for segmentation
 * tools that require drawing an annotation before running the segmentation strategy
 * for instance threshold segmentation based on an area and a threshold.
 */
abstract class BaseAnnotationTool extends BaseTool {
  // ===================================================================
  // Abstract Methods - Must be implemented.
  // ===================================================================

  /**
   * @abstract addNewMeasurement Creates a new annotation based on the clicked mouse position
   *
   * @param evt - The normalized mouse event
   * @param interactionType -  The interaction type used to add the measurement.
   */
  abstract addNewMeasurement(
    evt: EventTypes.MouseDownActivateEventType,
    interactionType: InteractionTypes
  ): ToolSpecificToolData

  /**
   * @abstract renderToolData it used to draw the tool's annotation data in each
   * request animation frame
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  abstract renderToolData(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  )

  /**
   * @abstract cancel Used to cancel the ongoing tool drawing and manipulation
   *
   */
  abstract cancel(element: HTMLElement)

  /**
   * handleSelectedCallback Custom callback for when a handle is selected.
   *
   * @param evt - The normalized mouse event
   * @param toolData - The toolData selected.
   * @param handle - The selected handle (either Types.Point3 in space for annotations, or TextBoxHandle object for text boxes).
   * @param interactionType - The interaction type the handle was selected with.
   */
  abstract handleSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    toolData: ToolSpecificToolData,
    handle: ToolHandle,
    interactionType: InteractionTypes
  ): void

  /**
   * Custom callback for when an annotation is selected
   *
   * @param evt - The normalized mouse event
   * @param toolData - The `ToolSpecificToolData` to check.
   * @param interactionType - The interaction type used to select the tool.
   */
  abstract toolSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    toolData: ToolSpecificToolData,
    interactionType: InteractionTypes
  ): void

  /**
   * Returns true if the provided canvas coordinate tool is near the toolData
   *
   * @param element - The HTML element
   * @param toolData - The toolData to check
   * @param canvasCoords - The canvas coordinate to check
   * @param proximity - The minimum proximity to consider the point near
   * @param interactionType - The interaction type used to select the tool.
   *
   * @returns boolean if the point is near.
   */
  abstract isPointNearTool(
    element: HTMLElement,
    toolData: ToolSpecificToolData,
    canvasCoords: Types.Point2,
    proximity: number,
    interactionType: string
  ): boolean

  /**
   * @virtual Given the element and toolState which is an array of toolData, it
   * filters the toolState array to only include the toolData based on the viewportType.
   * If the viewport is StackViewport, it filters based on the current imageId of the viewport,
   * if the viewport is volumeViewport, it only returns those that are within the
   * same slice as the current rendered slice in the volume viewport.
   * imageId as the enabledElement.
   * @param element - The HTML element
   * @param toolState - The toolState to filter (array of toolData)
   * @returns The filtered toolState
   */
  filterInteractableToolStateForElement(
    element: HTMLElement,
    toolState: ToolSpecificToolState
  ): ToolSpecificToolState | undefined {
    if (!toolState || !toolState.length) {
      return
    }

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    return filterToolStateForDisplay(viewport, toolState)
  }

  /**
   * @virtual Event handler for Cornerstone MOUSE_MOVE event.
   *
   *
   * @param evt - The normalized mouse event
   * @param filteredToolState - The toolState to check for hover interactions
   * @returns True if the annotation needs to be re-drawn by the annotationRenderingEngine.
   */
  public mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    filteredToolState: ToolSpecificToolState
  ): boolean => {
    const { element, currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas
    let annotationsNeedToBeRedrawn = false

    for (const toolData of filteredToolState) {
      // Do not do anything if the toolData is locked
      if (isToolDataLocked(toolData)) {
        continue
      }

      const { data } = toolData
      const activateHandleIndex = data.handles
        ? data.handles.activeHandleIndex
        : undefined

      // Perform tool specific imagePointNearToolOrHandle to determine if the mouse
      // is near the tool or its handles or its textBox.
      const near = this._imagePointNearToolOrHandle(
        element,
        toolData,
        canvasCoords,
        6 // Todo: This should come from the state
      )

      const nearToolAndNotMarkedActive = near && !data.active
      const notNearToolAndMarkedActive = !near && data.active
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        data.active = !data.active
        annotationsNeedToBeRedrawn = true
      } else if (
        data.handles &&
        data.handles.activeHandleIndex !== activateHandleIndex
      ) {
        // Active handle index has changed, re-render.
        annotationsNeedToBeRedrawn = true
      }
    }

    return annotationsNeedToBeRedrawn
  }

  /**
   * On Image Calibration, take all the toolData from the ToolState manager,
   * and invalidate them to force them to be re-rendered and their stats to be recalculated.
   * Then use the old and new imageData (non-calibrated and calibrated) to calculate the
   * new position for the annotations in the space of the new imageData.
   *
   * @param evt - The calibration event
   *
   */
  public onImageSpacingCalibrated = (
    evt: Types.EventTypes.ImageSpacingCalibratedEvent
  ) => {
    const {
      element,
      rowScale,
      columnScale,
      imageId,
      imageData: calibratedImageData,
      worldToIndex: noneCalibratedWorldToIndex,
    } = evt.detail

    const { viewport } = getEnabledElement(element)

    if (viewport instanceof VolumeViewport) {
      throw new Error('Cannot calibrate a volume viewport')
    }

    const calibratedIndexToWorld = calibratedImageData.getIndexToWorld()

    const imageURI = Utilities.imageIdToURI(imageId)
    const stateManager = getViewportSpecificStateManager(element)
    const framesOfReference = stateManager.getFramesOfReference()

    // For each frame Of Reference
    framesOfReference.forEach((frameOfReference) => {
      const frameOfReferenceSpecificToolState =
        stateManager.getFrameOfReferenceToolState(frameOfReference)

      const toolSpecificToolState = frameOfReferenceSpecificToolState[this.name]

      if (!toolSpecificToolState || !toolSpecificToolState.length) {
        return
      }

      // for this specific tool
      toolSpecificToolState.forEach((toolData) => {
        // if the toolData is drawn on the same imageId
        if (toolData.metadata.referencedImageId === imageURI) {
          // make them invalid since the image has been calibrated so that
          // we can update the cachedStats and also rendering
          toolData.data.invalidated = true
          toolData.data.cachedStats = {}

          // Update toolData points to the new calibrated points. Basically,
          // using the worldToIndex function we get the index on the non-calibrated
          // image and then using the calibratedIndexToWorld function we get the
          // corresponding point on the calibrated image world.
          toolData.data.handles.points = toolData.data.handles.points.map(
            (point) => {
              const p = vec4.fromValues(...point, 1)
              const pCalibrated = vec4.fromValues(0, 0, 0, 1)
              const nonCalibratedIndexVec4 = vec4.create()
              vec4.transformMat4(
                nonCalibratedIndexVec4,
                p,
                noneCalibratedWorldToIndex
              )
              const calibratedIndex = [
                columnScale * nonCalibratedIndexVec4[0],
                rowScale * nonCalibratedIndexVec4[1],
                nonCalibratedIndexVec4[2],
              ]

              vec4.transformMat4(
                pCalibrated,
                vec4.fromValues(
                  calibratedIndex[0],
                  calibratedIndex[1],
                  calibratedIndex[2],
                  1
                ),
                calibratedIndexToWorld
              )

              return pCalibrated.slice(0, 3) as Types.Point3
            }
          )
        }
      })

      triggerAnnotationRender(element)
    })
  }

  /**
   * It checks if the mouse click is near TextBoxHandle or AnnotationHandle itself, and
   * return either it. It prioritize TextBoxHandle over AnnotationHandle. If
   * the mouse click is not near any of the handles, it does not return anything.
   *
   * @param element - The element that the tool is attached to.
   * @param toolData - The tool data object associated with the annotation
   * @param canvasCoords - The coordinates of the mouse click on canvas
   * @param proximity - The distance from the mouse cursor to the point
   * that is considered "near".
   * @returns The handle that is closest to the cursor, or null if the cursor
   * is not near any of the handles.
   */
  getHandleNearImagePoint(
    element: HTMLElement,
    toolData: ToolSpecificToolData,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
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
        vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity

      if (near === true) {
        data.handles.activeHandleIndex = i
        return point
      }
    }

    data.handles.activeHandleIndex = null
  }

  /**
   * It takes the settings (e.g., global, or runtime setting), the property (e.g., 'lineWidth'),
   * and the tool data, and returns the value of the property
   * of the property
   * @param settings - The settings object for the tool.
   * @param property - The name of the style property to get.
   * @param toolData - The tool data for the tool that is
   * currently active.
   * @returns The value of the property.
   */
  public getStyle(
    settings: Settings,
    property: string,
    toolData?: ToolSpecificToolData
  ): unknown {
    return getStyleProperty(
      settings,
      property,
      getToolDataStyleState(toolData),
      this.mode
    )
  }

  /**
   * It returns the style for the text box
   * @param settings - The settings object for the tool.
   * @param toolData - The tool data for the tool that is
   * currently active.
   * @returns An object of the style settings for the text box.
   */
  public getLinkedTextBoxStyle(
    settings: Settings,
    toolData?: ToolSpecificToolData
  ): Record<string, unknown> {
    // Todo: this function can be used to set different styles for different toolMode
    // for the textBox.

    return {
      fontFamily: this.getStyle(settings, 'textBox.fontFamily', toolData),
      fontSize: this.getStyle(settings, 'textBox.fontSize', toolData),
      color: this.getStyle(settings, 'textBox.color', toolData),
      background: this.getStyle(settings, 'textBox.background', toolData),
      lineWidth: this.getStyle(settings, 'textBox.link.lineWidth', toolData),
      lineDash: this.getStyle(settings, 'textBox.link.lineDash', toolData),
    }
  }

  /**
   * Returns true if the `canvasCoords` are near a handle or selectable part of the tool
   *
   * @param element - The HTML element
   * @param toolData - The toolData to check
   * @param canvasCoords - The canvas coordinates to check
   * @param proximity - The proximity to consider
   *
   * @returns If the point is near.
   */
  private _imagePointNearToolOrHandle(
    element: HTMLElement,
    toolData: ToolSpecificToolData,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean {
    // Based on the tool instance type, check if the point is near the tool handles
    const handleNearImagePoint = this.getHandleNearImagePoint(
      element,
      toolData,
      canvasCoords,
      proximity
    )

    if (handleNearImagePoint) {
      return true
    }

    // If the point is not near the handles, check if the point is near the tool
    const toolNewImagePoint = this.isPointNearTool(
      element,
      toolData,
      canvasCoords,
      proximity,
      'mouse'
    )

    if (toolNewImagePoint) {
      return true
    }
  }
}

export default BaseAnnotationTool
