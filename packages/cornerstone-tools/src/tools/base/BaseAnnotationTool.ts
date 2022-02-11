import {
  Settings,
  Utilities,
  Types,
} from '@precisionmetrics/cornerstone-render'
import { vec4 } from 'gl-matrix'

import BaseTool from './BaseTool'
import { isToolDataLocked } from '../../stateManagement/toolDataLocking'
import { getStyleProperty } from '../../stateManagement/toolStyle'
import { getViewportSpecificStateManager } from '../../stateManagement/toolState'
import {
  ToolSpecificToolData,
  ToolSpecificToolState,
  Point2,
} from '../../types'
import getToolDataStyle from '../../util/getToolDataStyle'
import triggerAnnotationRender from '../../util/triggerAnnotationRender'
export interface BaseAnnotationToolSpecificToolData
  extends ToolSpecificToolData {
  data: {
    active: boolean
    handles: any
    cachedStats: any
  }
}

/**
 * @class BaseAnnotationTool @extends BaseTool
 * @classdesc Abstract class for tools which create and display annotations on the
 * cornerstone3D canvas.
 */
abstract class BaseAnnotationTool extends BaseTool {
  // ===================================================================
  // Abstract Methods - Must be implemented.
  // ===================================================================

  /**
   * @abstract @method addNewMeasurement Creates a new annotation.
   *
   * @method createNewMeasurement
   * @memberof BaseAnnotationTool
   *
   * @param  {CustomEvent} evt The event.
   * @param  {string} interactionType The interaction type used to add the measurement.
   */
  abstract addNewMeasurement(
    evt: CustomEvent,
    interactionType: string
  ): ToolSpecificToolData

  /**
   * @abstract @method renderToolData Used to redraw the tool's annotation data per render
   *
   * @param {CustomEvent} evt The IMAGE_RENDERED event.
   */
  abstract renderToolData(evt: any, svgDrawingHelper: any)

  /**
   * @abstract @method cancel Used to cancel the ongoing tool drawing and manipulation
   *
   */
  abstract cancel(element: HTMLElement)

  // ===================================================================
  // Virtual Methods - Have default behavior or are optional.
  // ===================================================================

  /**
   * @virtual @method handleSelectedCallback Custom callback for when a handle is selected.
   * @memberof Tools.Base.BaseAnnotationTool
   *
   * @param  {CustomEvent} evt The event.
   * @param  {ToolSpecificToolData} toolData - The toolData selected.
   * @param  {any} handle - The selected handle.
   * @param  {string} interactionType - The intraction type the handle was selected with.
   */
  public abstract handleSelectedCallback(
    evt,
    toolData: ToolSpecificToolData,
    handle,
    interactionType
  ): void

  /**
   * @virtual @method toolSelectedCallback Custom callback for when a tool is selected.
   * @memberof BaseAnnotationTool
   *
   * @param  {CustomEvent} evt The event.
   * @param  {ToolSpecificToolData} toolData - The `ToolSpecificToolData` to check.
   * @param  {string} [interactionType=mouse]
   */
  public abstract toolSelectedCallback(
    evt,
    toolData: ToolSpecificToolData,
    interactionType
  ): void

  /**
   * @virtual @method Event handler for MOUSE_MOVE event.
   *
   *
   * @param {CustomEvent} evt - The event.
   * @param {ToolSpecificToolState} filteredToolState The toolState to check for hover interactions
   * @returns {boolean} - True if the image needs to be updated.
   */
  public mouseMoveCallback = (
    evt,
    filteredToolState: ToolSpecificToolState
  ): boolean => {
    const { element, currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas
    let annotationsNeedToBeRedrawn = false

    for (let i = 0; i < filteredToolState.length; i++) {
      const toolData = filteredToolState[
        i
      ] as BaseAnnotationToolSpecificToolData

      if (isToolDataLocked(toolData)) {
        continue
      }

      const { data } = toolData
      const activateHandleIndex = data.handles
        ? data.handles.activeHandleIndex
        : undefined

      const near = this._imagePointNearToolOrHandle(
        element,
        toolData,
        canvasCoords,
        6
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

  public onImageSpacingCalibrated = (evt) => {
    const eventData = evt.detail
    const { element } = eventData
    const {
      rowScale,
      columnScale,
      imageId,
      imageData: calibratedImageData,
      worldToIndex: noneCalibratedWorldToIndex,
    } = evt.detail

    const calibratedIndexToWorld = calibratedImageData.getIndexToWorld()

    const imageURI = Utilities.imageIdToURI(imageId)

    // Todo: handle other specific state managers that we might add in future
    const stateManager = getViewportSpecificStateManager(element)

    const framesOfReferenece = stateManager.getFramesOfReference()

    // For all the frameOfReferences
    framesOfReferenece.forEach((frameOfReference) => {
      const frameOfReferenceSpecificToolState =
        stateManager.getFrameOfReferenceToolState(frameOfReference)

      const toolSpecificToolState = frameOfReferenceSpecificToolState[this.name]

      if (!toolSpecificToolState || !toolSpecificToolState.length) {
        return
      }

      // for this specific tool
      toolSpecificToolState.forEach((toolData) => {
        // if the tooldata is drawn on the same imageId
        if (toolData.metadata.referencedImageId === imageURI) {
          toolData.data.invalidated = true
          toolData.data.cachedStats = {}

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

              return <Types.Point3>pCalibrated.slice(0, 3)
            }
          )
        }
      })

      triggerAnnotationRender(element)
    })
  }

  /**
   * @virtual @method getHandleNearImagePoint
   * @memberof BaseAnnotationTool
   *
   * @param {HTMLElement} element The cornerstone3D enabled element.
   * @param {ToolSpecificToolData} toolData The toolData to check.
   * @param {Point2} canvasCoords The image point in canvas coordinates.
   * @param {number} proximity The proximity to accept.
   *
   * @returns {any|undefined} The handle if found (may be a point, textbox or other).
   */
  public abstract getHandleNearImagePoint(
    element: HTMLElement,
    toolData: ToolSpecificToolData,
    canvasCoords: Point2,
    proximity: number
  ): unknown

  /**
   * @virtual @method Returns true if the given coords are need the tool.
   * @memberof BaseAnnotationTool
   *
   * @param {HTMLElement} element
   * @param  {ToolSpecificToolData} toolData - The `ToolSpecificToolData` to check.
   * @param {Point2} canvasCoords The image point in canvas coordinates.
   * @param {number} proximity The proximity to accept.
   * @param {string} interactionType The interaction type used to add the measurement.
   *
   * @returns {boolean} If the point is near the tool.
   */
  public abstract pointNearTool(
    element: HTMLElement,
    toolData: ToolSpecificToolData,
    canvasCoords: Point2,
    proximity: number,
    interactionType: string
  ): boolean

  /**
   * @protected @method _imagePointNearToolOrHandle Returns true if the
   * `canvasCoords` are near a handle or selectable part of the tool
   * @memberof BaseAnnotationTool
   *
   * @param {HTMLElement} element
   * @param {ToolSpecificToolData} toolData
   * @param {Point2} canvasCoords
   * @param {number} proximity
   *
   * @returns {boolean} If the point is near.
   */
  protected _imagePointNearToolOrHandle(
    element: HTMLElement,
    toolData: ToolSpecificToolData,
    canvasCoords: Point2,
    proximity: number
  ): boolean {
    const handleNearImagePoint = this.getHandleNearImagePoint(
      element,
      toolData,
      canvasCoords,
      proximity
    )

    if (handleNearImagePoint) {
      return true
    }

    // todo: support other interactions
    const toolNewImagePoint = this.pointNearTool(
      element,
      toolData,
      canvasCoords,
      proximity,
      'mouse'
    )

    return toolNewImagePoint
  }

  public getStyle(
    settings: Settings,
    property: string,
    toolData?: ToolSpecificToolData
  ): unknown {
    return getStyleProperty(
      settings,
      property,
      getToolDataStyle(toolData),
      this.mode
    )
  }

  public getLinkedTextBoxStyle(
    settings: Settings,
    toolData?: ToolSpecificToolData
  ): Record<string, unknown> {
    return {
      fontFamily: this.getStyle(settings, 'textBox.fontFamily', toolData),
      fontSize: this.getStyle(settings, 'textBox.fontSize', toolData),
      color: this.getStyle(settings, 'textBox.color', toolData),
      background: this.getStyle(settings, 'textBox.background', toolData),
      lineWidth: this.getStyle(settings, 'textBox.link.lineWidth', toolData),
      lineDash: this.getStyle(settings, 'textBox.link.lineDash', toolData),
    }
  }

  _getTargetStackUID(viewport) {
    return `stackTarget:${viewport.uid}`
  }

  _getTargetVolumeUID = (viewport) => {
    if (this.configuration.volumeUID) {
      return this.configuration.volumeUID
    }

    const actors = viewport.getActors()

    if (!actors && !actors.length) {
      return
    }

    return actors[0].volumeActor.uid
  }
}

export default BaseAnnotationTool
