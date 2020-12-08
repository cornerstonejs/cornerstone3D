import BaseTool from './BaseTool';
import { getToolState } from '../../stateManagement/toolState';
//import handleActivator from './../../manipulators/handleActivator.js';
// import {
//   moveHandleNearImagePoint,
//   moveAnnotation,
// } from './../../util/findAndMoveHelpers.js';

/**
 * @memberof Tools.Base
 * @classdesc Abstract class for tools which create and display annotations on the
 * cornerstone canvas.
 * @extends Tools.Base.BaseTool
 */
class BaseAnnotationTool extends BaseTool {
  // ===================================================================
  // Abstract Methods - Must be implemented.
  // ===================================================================

  /**
   * Creates a new annotation.
   *
   * @method createNewMeasurement
   * @memberof Tools.Base.BaseAnnotationTool
   *
   * @param  {type} evt description
   * @returns {type}     description
   */
  // eslint-disable-next-line no-unused-vars
  createNewMeasurement(evt) {
    throw new Error(
      `Method createNewMeasurement not implemented for ${this.name}.`
    );
  }

  pointNearHandle(element, data, coords, interactionType = 'mouse') {
    throw new Error(`Method pointNearHandle not implemented for ${this.name}.`);
  }

  /**
   * Returns the distance in px from the given coords to the closest handle of the annotation.
   *
   * @method distanceFromPoint
   * @memberof Tools.Base.BaseAnnotationTool
   *
   * @param {*} element
   * @param {*} data
   * @param {*} coords
   * @returns {number} -  the distance in px from the provided coordinates to the
   * closest rendered portion of the annotation. -1 if the distance cannot be
   * calculated.
   */
  // eslint-disable-next-line no-unused-vars
  distanceFromPoint(element, data, coords) {
    throw new Error(
      `Method distanceFromPoint not implemented for ${this.name}.`
    );
  }

  /**
   * Used to redraw the tool's annotation data per render
   *
   * @abstract
   * @param {*} evt
   * @returns {void}
   */
  // eslint-disable-next-line no-unused-vars
  renderToolData(evt) {
    throw new Error(`renderToolData not implemented for ${this.name}.`);
  }

  // ===================================================================
  // Virtual Methods - Have default behavior but may be overriden.
  // ===================================================================

  /**
   * Event handler for MOUSE_MOVE event.
   *
   * @abstract
   * @event
   * @param {Object} evt - The event.
   * @returns {boolean} - True if the image needs to be updated
   */
  mouseMoveCallback(evt, toolState) {
    // TODO
    // const { element, currentPoints } = evt.detail;
    // const coords = currentPoints.canvas;
    // const toolState = getToolState(element, this.name);
    // let imageNeedsUpdate = false;
    // for (let d = 0; d < toolState.data.length; d++) {
    //   const data = toolState.data[d];
    //   // Hovering a handle?
    //   if (handleActivator(element, data.handles, coords) === true) {
    //     imageNeedsUpdate = true;
    //   }
    //   // Tool data's 'active' does not match coordinates
    //   // TODO: can't we just do an if/else and save on a pointNearTool check?
    //   const nearToolAndNotMarkedActive =
    //     this.pointNearTool(element, data, coords, 'mouse') && !data.active;
    //   const notNearToolAndMarkedActive =
    //     !this.pointNearTool(element, data, coords, 'mouse') && data.active;
    //   if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
    //     data.active = !data.active;
    //     imageNeedsUpdate = true;
    //   }
    // }
    //return imageNeedsUpdate;
  }

  /**
   * Custom callback for when a handle is selected.
   * @method handleSelectedCallback
   * @memberof Tools.Base.BaseAnnotationTool
   *
   * @param  {*} evt    -
   * @param  {*} toolData   -
   * @param  {*} handle - The selected handle.
   * @param  {String} interactionType -
   * @returns {void}
   */
  handleSelectedCallback(evt, toolData, handle, interactionType = 'mouse') {
    console.warn('todo handleSelectedCallback!');
    //moveHandleNearImagePoint(evt, this, toolData, handle, interactionType);
  }

  /**
   * Custom callback for when a tool is selected.
   *
   * @method toolSelectedCallback
   * @memberof Tools.Base.BaseAnnotationTool
   *
   * @param  {*} evt
   * @param  {*} annotation
   * @param  {string} [interactionType=mouse]
   * @returns {void}
   */
  toolSelectedCallback(evt, annotation, interactionType = 'mouse') {
    console.warn('todo toolSelectedCallback!');
    //moveAnnotation(evt, this, annotation, interactionType);
  }

  /**
   * Updates cached statistics for the tool's annotation data on the element
   *
   * @param {*} image
   * @param {*} element
   * @param {*} data
   * @returns {void}
   */
  updateCachedStats(image, element, data) {
    console.warn(`updateCachedStats not implemented for ${this.name}.`);
  }

  /**
   *
   * Returns true if the given coords are need the tool.
   *
   * @method pointNearTool
   * @memberof Tools.Base.BaseAnnotationTool
   *
   * @param {*} element
   * @param {*} data
   * @param {*} coords
   * @param {string} [interactionType=mouse]
   * @returns {boolean} If the point is near the tool
   */
  // eslint-disable-next-line no-unused-vars
  pointNearTool(element, data, coords, interactionType = 'mouse') {
    console.warn(`pointNearTool not implemented for ${this.name}.`);
  }
}

export default BaseAnnotationTool;
