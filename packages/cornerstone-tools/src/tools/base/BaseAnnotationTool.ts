import { Settings } from '@ohif/cornerstone-render'
import BaseTool from './BaseTool'
import { getStyleProperty } from '../../stateManagement/toolStyle'
import {
  ToolSpecificToolData,
  ToolSpecificToolState,
  Point2,
} from '../../types'
import getToolDataStyle from '../../util/getToolDataStyle'

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
    let imageNeedsUpdate = false

    for (let i = 0; i < filteredToolState.length; i++) {
      const toolData = filteredToolState[i]
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
        imageNeedsUpdate = true
      } else if (
        data.handles &&
        data.handles.activeHandleIndex !== activateHandleIndex
      ) {
        // Active handle index has changed, re-render.
        imageNeedsUpdate = true
      }
    }

    return imageNeedsUpdate
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
}

export default BaseAnnotationTool
