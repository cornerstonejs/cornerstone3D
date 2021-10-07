import BaseTool from './BaseTool'
import { getLabelmapUIDForElement } from '../../store/SegmentationModule'

// export interface BaseAnnotationToolSpecificToolData
//   extends ToolSpecificToolData {
//   data: {
//     active: boolean
//     handles: any
//     cachedStats: any
//   }
// }

/**
 * @abstract
 * @memberof Tools.Base
 * @classdesc Abstract class for tools which manipulate the mask data to be displayed on
 * the cornerstone canvas.
 * @extends Tools.Base.BaseTool
 */
abstract class BaseBrushTool extends BaseTool {
  protected _drawing = false
  // ===================================================================
  // Abstract Methods - Must be implemented.
  // ===================================================================

  addNewMeasurement(evt: CustomEvent, interactionType: string) {
    this.addPaint(evt, interactionType)
  }

  abstract addPaint(evt, interactionType)

  /**
   * Helper function for rendering the brush.
   *
   * @abstract
   * @param {Object} evt - The event.
   * @returns {void}
   */
  // eslint-disable-next-line no-unused-vars
  renderBrush(evt) {
    throw new Error(`Method renderBrush not implemented for ${this.name}.`)
  }

  /**
   * Paints the data to the labelmap.
   *
   * @protected
   * @abstract
   * @param  {Object} evt The event.
   * @returns {void}
   */
  // eslint-disable-next-line no-unused-vars
  _paint(evt) {
    throw new Error(`Method _paint not implemented for ${this.name}.`)
  }

  // ===================================================================
  // Virtual Methods - Have default behavior but may be overriden.
  // ===================================================================

  /**
   * Event handler for MOUSE_DRAG event.
   *
   * @override
   * @abstract
   * @event
   * @param {Object} evt - The event.
   */
  mouseDragCallback(evt) {
    const { currentPoints } = evt.detail

    // Safety measure incase _startPainting is overridden and doesn't always
    // start a paint.
    if (this._drawing) {
      this._paint(evt)
    }
  }

  /**
   * Event handler for MOUSE_DOWN event.
   *
   * @override
   * @abstract
   * @event
   * @param {Object} evt - The event.
   */
  preMouseDownCallback(evt) {
    const paintData = this._startPainting(evt)

    this._drawing = true
    this._paint(paintData)

    return true
  }

  /**
   * Initialize painting with BaseBrushTool.
   *
   * @abstract
   * @event
   * @param {Object} evt - The event.
   * @returns {void}
   */
  _startPainting(evt) {
    const { viewportUID, sceneUID, currentPoints, event } = evt.detail

    const canvas = event.currentTarget
    const labelmap = getLabelmapUIDForElement(canvas)

    return {
      canvas,
      labelmap,
      viewportUID,
      sceneUID,
      currentPoints,
    }
  }

  /**
   * End painting with BaseBrushTool.
   *
   * @abstract
   * @event
   * @param {Object} evt - The event.
   * @returns {void}
   */
  _endPainting(evt) {
    // const { configuration, setters } = segmentationModule
    // const { labelmap2D, currentImageIdIndex } = this.paintEventData
    // // Grab the labels on the slice.
    // const segmentSet = new Set(labelmap2D.pixelData)
    // const iterator = segmentSet.values()
    // const segmentsOnLabelmap = []
    // let done = false
    // while (!done) {
    //   const next = iterator.next()
    //   done = next.done
    //   if (!done) {
    //     segmentsOnLabelmap.push(next.value)
    //   }
    // }
    // labelmap2D.segmentsOnLabelmap = segmentsOnLabelmap
    // if (configuration.storeHistory) {
    //   const { previousPixelData } = this.paintEventData
    //   const newPixelData = labelmap2D.pixelData
    //   const operation = {
    //     imageIdIndex: currentImageIdIndex,
    //     diff: getDiffBetweenPixelData(previousPixelData, newPixelData),
    //   }
    //   setters.pushState(this.element, [operation])
    // }
    // triggerLabelmapModifiedEvent(this.element)
  }

  // ===================================================================
  // Implementation interface
  // ===================================================================

  /**
   * Event handler for MOUSE_MOVE event.
   *
   * @override
   * @abstract
   * @event
   * @param {Object} evt - The event.
   */
  mouseMoveCallback(evt) {}

  /**
   * Used to redraw the tool's cursor per render.
   *
   * @override
   * @param {Object} evt - The event.
   */
  renderToolData(evt) {
    const eventData = evt.detail
    const element = eventData.element

    // Only brush needs to render.
    // if (isToolActiveForElement(element, this.name)) {
    // Call the hover event for the brush
    // this.renderBrush(evt)
    // }
  }

  /**
   * Event handler for MOUSE_UP during the drawing event loop.
   *
   * @protected
   * @event
   * @param {Object} evt - The event.
   * @returns {void}
   */
  _drawingMouseUpCallback(evt) {
    const eventData = evt.detail
    const element = eventData.element

    this._endPainting(evt)

    this._drawing = false
    // this._mouseUpRender = true
    // this._stopListeningForMouseUp(element)
  }

  newImageCallback(evt) {
    // if (this._drawing) {
    //   // End painting on one slice and start on another.
    //   this._endPainting(evt)
    //   this._startPainting(evt)
    // }
  }

  // ===================================================================
  // Brush API. This is effectively a wrapper around the store.
  // ===================================================================

  /**
   * Increases the brush size
   *
   * @public
   * @api
   * @returns {void}
   */
  increaseBrushSize() {
    // const { configuration, setters } = segmentationModule
    // const oldRadius = configuration.radius
    // let newRadius = Math.floor(oldRadius * 1.2)
    // // If e.g. only 2 pixels big. Math.floor(2*1.2) = 2.
    // // Hence, have minimum increment of 1 pixel.
    // if (newRadius === oldRadius) {
    //   newRadius += 1
    // }
    // setters.radius(newRadius)
  }

  /**
   * Decreases the brush size
   *
   * @public
   * @api
   * @returns {void}
   */
  decreaseBrushSize() {
    // const { configuration, setters } = segmentationModule
    // const oldRadius = configuration.radius
    // const newRadius = Math.floor(oldRadius * 0.8)
    // setters.radius(newRadius)
  }
}

export default BaseBrushTool
