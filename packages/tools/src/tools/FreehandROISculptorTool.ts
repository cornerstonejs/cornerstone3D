import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { BaseTool } from './base';
import { getAnnotations } from '../stateManagement';
import {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../types';
import { point } from '../utilities/math';
import { Events, ToolModes, AnnotationStyleStates } from '../enums';
import { drawCircle as drawCircleSvg } from '../drawingSvg';
import { ToolGroupManager } from '../store';
import getViewportIdsWithToolToRender from './../utilities/viewportFilters/getViewportIdsWithToolToRender';
import { triggerAnnotationRenderForViewportIds } from './../utilities/triggerAnnotationRenderForViewportIds';
import {
  hideElementCursor,
  resetElementCursor,
} from '../cursors/elementCursor';
import { StyleSpecifier } from '../types/AnnotationStyle';
import { getStyleProperty } from '../stateManagement/annotation/config/helpers';

class FreehandROISculptorTool extends BaseTool {
  static toolName: string;
  private _sculptData?: {
    mousePoint: Types.Point3;
    mouseCanvasPoint: Types.Point2;
    points: Array<Types.Point3>;
    toolSize: number;
    maxSpacing: number;
    element: HTMLDivElement;
  };
  toolSize: number;
  isActive = false;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        mouseLocation: null,
        maxToolSize: null,
        minSpacing: 1,
        selectedIndex: null,
        isEditingOpenContour: false,
        referencedToolNames: ['PlanarFreehandROI', 'ContourROI'],
        referencedToolName: 'PlanarFreehandROI',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this._endCallback = this._endCallback.bind(this);
    this._dragCallback = this._dragCallback.bind(this);
  }

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): void {
    const { viewport } = enabledElement;
    const { element } = viewport;

    if (!this.configuration.mouseLocation || this.mode !== ToolModes.Active) {
      return;
    }

    const annotations =
      this._filterInteractableFreehandRoiAnnotationsForElement(element);

    if (!annotations?.length) {
      return;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    let color = getStyleProperty(
      'color',
      styleSpecifier,
      AnnotationStyleStates.Default,
      this.mode
    );

    if (this.isActive) {
      color = getStyleProperty(
        'color',
        styleSpecifier,
        AnnotationStyleStates.Highlighted,
        this.mode
      );
    }

    const circleUID = '0';

    drawCircleSvg(
      svgDrawingHelper,
      '',
      circleUID,
      this.configuration.mouseLocation as Types.Point2,
      this.toolSize,
      {
        color,
      }
    );
  }

  preMouseDownCallback = (evt: EventTypes.InteractionEventType) => {
    const eventData = evt.detail;
    const config = this.configuration;
    const element = eventData.element;

    this._configureToolSize(evt);
    this._selectFreehandTool(eventData);

    if (config.selectedIndex === null) {
      return;
    }

    this.isActive = true;

    hideElementCursor(element);
    this._activateSculpt(element);
    return true;
  };

  /**
   * Event handler for MOUSE_UP during the active loop.
   *
   * @param evt - The event
   */
  _endCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ): void => {
    const eventData = evt.detail;
    const { element } = eventData;
    const config = this.configuration;
    const enabledElement = getEnabledElement(element);

    this.isActive = false;
    this._deactivateSculpt(element);
    resetElementCursor(element);

    const { renderingEngineId, viewportId, viewport } = enabledElement;

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewportId,
      renderingEngineId
    );

    const toolInstance = toolGroup.getToolInstance(config.referencedToolName);

    const annotations =
      this._filterInteractableFreehandRoiAnnotationsForElement(element);

    if (toolInstance.configuration.calculateStats) {
      annotations[config.selectedIndex].invalidated = true;
    }

    toolInstance.triggerAnnotationModified(
      annotations[config.selectedIndex],
      enabledElement
    );
  };

  /**
   * Event handler for MOUSE_DRAG during the active loop.
   *
   * @param evt - The event
   */
  _dragCallback(evt: EventTypes.InteractionEventType): void {
    const config = this.configuration;
    const eventData = evt.detail;
    const element = eventData.element;
    this._updateCursor(evt);

    const annotations =
      this._filterInteractableFreehandRoiAnnotationsForElement(element);

    if (!annotations?.length || !this.isActive) {
      return;
    }

    const points = annotations[config.selectedIndex].data.polyline;

    this._sculpt(eventData, points);
  }

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    if (this.mode === ToolModes.Active) {
      this._configureToolSize(evt);
      this._updateCursor(evt);
    } else {
      this.configuration.mouseLocation = undefined;
    }
  };

  /**
   * Updates cursor size
   *
   * @param evt - The event
   */
  _updateCursor(evt: EventTypes.InteractionEventType): void {
    const eventData = evt.detail;
    const element = eventData.element;
    const config = this.configuration;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      config.referencedToolName
    );

    const annotations =
      this._filterInteractableFreehandRoiAnnotationsForElement(element);

    if (!annotations?.length) {
      return;
    }

    config.mouseLocation = eventData.currentPoints.canvas;

    if (this.isActive) {
      annotations[config.selectedIndex].highlighted = true;
    } else {
      const canvasCoords = eventData.currentPoints.canvas;
      const radius = this._distanceFromPoint(
        viewport,
        annotations[config.selectedIndex]?.data,
        canvasCoords
      );
      if (radius > 0) {
        this.toolSize = Math.min(config.maxToolSize, radius);
      }
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }

  /**
   * Returns interactable freehand ROI annotations
   *
   * @param element - The viewport element
   */
  _filterInteractableFreehandRoiAnnotationsForElement(element: HTMLDivElement) {
    const config = this.configuration;
    const enabledElement = getEnabledElement(element);
    const { renderingEngineId, viewportId } = enabledElement;
    let interactableAnnotation = [];

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewportId,
      renderingEngineId
    );

    const toolInstance = toolGroup.getToolInstance(
      config.referencedToolNames[0]
    );

    config.referencedToolNames.forEach((referencedToolName) => {
      const annotation = getAnnotations(referencedToolName, element);
      if (annotation) {
        interactableAnnotation = [...interactableAnnotation, ...annotation];
      }
    });

    interactableAnnotation =
      toolInstance.filterInteractableAnnotationsForElement(
        element,
        interactableAnnotation
      );

    return interactableAnnotation;
  }

  _configureToolSize(evt: EventTypes.InteractionEventType): void {
    const config = this.configuration;

    if (this.toolSize && config.maxToolSize) {
      return;
    }

    const eventData = evt.detail;
    const element = eventData.element;
    const minDim = Math.min(element.clientWidth, element.clientHeight);
    const sampleArea = Math.pow(minDim / 5, 2);
    const maxRadius = Math.pow(sampleArea / Math.PI, 0.5);

    this.toolSize = maxRadius;
    config.maxToolSize = maxRadius;
  }

  /**
   * Sculpts the freehand ROI with the circular freehandSculpter tool, moving,
   * adding and removing handles as necessary.
   *
   * @param eventData - Data object associated with the event.
   * @param points - Array of points
   */
  _sculpt(eventData: any, points: Array<Types.Point3>): void {
    const config = this.configuration;
    const element = eventData.element;

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this._sculptData = {
      mousePoint: eventData.currentPoints.world,
      mouseCanvasPoint: eventData.currentPoints.canvas,
      points,
      toolSize: this.toolSize,
      maxSpacing: Math.max(this.toolSize / 4, config.minSpacing),
      element: element,
    };

    const pushedHandles = this._pushHandles(viewport);

    if (pushedHandles.first !== undefined) {
      this._insertNewHandles(pushedHandles);
    }
  }

  /**
   * Inserts additional handles in sparsely sampled regions of the contour. The
   * new handles are placed on the circle defined by the the freehandSculpter's
   * toolSize and the mouse position.
   */
  _insertNewHandles(pushedHandles: {
    first: number;
    last: number | undefined;
  }): void {
    const indicesToInsertAfter = this._findNewHandleIndices(pushedHandles);
    let newIndexModifier = 0;
    for (let i = 0; i < indicesToInsertAfter?.length; i++) {
      const insertIndex = indicesToInsertAfter[i] + 1 + newIndexModifier;

      this._insertHandleRadially(insertIndex);
      newIndexModifier++;
    }
  }

  /**
   * Returns an array of indicies that describe where new handles should be inserted
   *
   * @param pushedHandles - The first and last handles that were pushed.
   */
  _findNewHandleIndices(pushedHandles: {
    first: number | undefined;
    last: number | undefined;
  }): Array<number> {
    const { points, maxSpacing } = this._sculptData;
    const indicesToInsertAfter = [];

    for (let i = pushedHandles.first; i <= pushedHandles.last; i++) {
      this._checkSpacing(i, points, indicesToInsertAfter, maxSpacing);
    }

    return indicesToInsertAfter;
  }

  /**
   * Inserts a handle on the surface of the circle defined by toolSize and the mousePoint.
   *
   * @param insertIndex - The index to insert the new handle.
   */
  _insertHandleRadially(insertIndex: number): void {
    const config = this.configuration;
    const { points } = this._sculptData;

    if (insertIndex > points.length - 1 && config.isEditingOpenContour) {
      return;
    }

    const previousIndex = insertIndex - 1;
    const nextIndex = this._getNextHandleIndexBeforeInsert(
      insertIndex,
      points.length
    );
    const insertPosition = this._getInsertPosition(previousIndex, nextIndex);
    const handleData = insertPosition;

    points.splice(insertIndex, 0, handleData);
  }

  /**
   * Calculates the position that a new handle should be inserted.
   *
   * @param previousIndex - The previous index
   * @param nextIndex - The next index
   */
  _getInsertPosition(previousIndex: number, nextIndex: number): Types.Point3 {
    let insertPosition;
    const { points, toolSize, element, mouseCanvasPoint } = this._sculptData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const previousCanvasPoint = viewport.worldToCanvas(points[previousIndex]);
    const nextCanvasPoint = viewport.worldToCanvas(points[nextIndex]);

    const midPoint: Types.Point2 = [
      (previousCanvasPoint[0] + nextCanvasPoint[0]) / 2.0,
      (previousCanvasPoint[1] + nextCanvasPoint[1]) / 2.0,
    ];

    const distanceToMidPoint = point.distanceToPoint(
      mouseCanvasPoint,
      midPoint
    );

    if (distanceToMidPoint < toolSize) {
      const directionUnitVector = {
        x: (midPoint[0] - mouseCanvasPoint[0]) / distanceToMidPoint,
        y: (midPoint[1] - mouseCanvasPoint[1]) / distanceToMidPoint,
      };

      insertPosition = [
        mouseCanvasPoint[0] + toolSize * directionUnitVector.x,
        mouseCanvasPoint[1] + toolSize * directionUnitVector.y,
      ];
    } else {
      insertPosition = midPoint;
    }

    const worldPosition = viewport.canvasToWorld(insertPosition);

    return worldPosition;
  }

  /**
   * Pushes the points radially away from the mouse if they are
   * contained within the circle defined by the freehandSculpter's toolSize and
   * the mouse position.
   *
   * @param viewport
   */
  _pushHandles(viewport: Types.IViewport) {
    const { points, toolSize, mouseCanvasPoint } = this._sculptData;
    const pushedHandles = { first: undefined, last: undefined };

    for (let i = 0; i < points.length; i++) {
      const handleCanvasPoint = viewport.worldToCanvas(points[i]);
      const distanceToHandle = point.distanceToPoint(
        handleCanvasPoint,
        mouseCanvasPoint
      );

      if (distanceToHandle > toolSize) {
        continue;
      }

      // Push point if inside circle, to edge of circle.
      this._pushOneHandle(i, distanceToHandle);
      if (pushedHandles.first === undefined) {
        pushedHandles.first = i;
        pushedHandles.last = i;
      } else {
        pushedHandles.last = i;
      }
    }

    return pushedHandles;
  }

  /**
   * Pushes one handle.
   * @param i - Index of the handle to push
   * @param distanceToHandle -  - The distance between the mouse cursor and the handle.
   */
  _pushOneHandle(i: number, distanceToHandle: number): void {
    const { points, mousePoint, toolSize } = this._sculptData;
    const handle = points[i];

    const directionUnitVector = {
      x: (handle[0] - mousePoint[0]) / distanceToHandle,
      y: (handle[1] - mousePoint[1]) / distanceToHandle,
      z: (handle[2] - mousePoint[2]) / distanceToHandle,
    };

    const position = {
      x: mousePoint[0] + toolSize * directionUnitVector.x,
      y: mousePoint[1] + toolSize * directionUnitVector.y,
      z: mousePoint[2] + toolSize * directionUnitVector.z,
    };

    handle[0] = position.x;
    handle[1] = position.y;
    handle[2] = position.z;
  }

  /**
   * Select the freehand tool to be edited
   *
   * @param eventData - Data object associated with the event.
   */
  _selectFreehandTool(eventData: any): void {
    const config = this.configuration;
    const closestToolIndex = this._getClosestFreehandToolOnElement(eventData);

    if (closestToolIndex === undefined) {
      return;
    }

    config.selectedIndex = closestToolIndex;
  }

  /**
   * Finds the nearest handle to the mouse cursor for all freehand
   * data on the element.
   *
   * @param eventData - Data object associated with the event.
   */
  _getClosestFreehandToolOnElement(eventData: any): number {
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const config = this.configuration;

    const annotations =
      this._filterInteractableFreehandRoiAnnotationsForElement(element);

    if (!annotations?.length) {
      return;
    }

    const canvasPoints = eventData.currentPoints.canvas;

    const closest = {
      distance: Infinity,
      toolIndex: undefined,
    };

    for (let i = 0; i < annotations?.length; i++) {
      if (annotations[i].isLocked || !annotations[i].isVisible) {
        continue;
      }

      const distanceFromTool = this._distanceFromPoint(
        viewport,
        annotations[i].data,
        canvasPoints
      );

      if (distanceFromTool === -1) {
        continue;
      }

      if (distanceFromTool < closest.distance) {
        closest.distance = distanceFromTool;
        closest.toolIndex = i;
      }
    }

    config.isEditingOpenContour =
      annotations[closest.toolIndex].data.isOpenContour;

    config.referencedToolName =
      annotations[closest.toolIndex].metadata.toolName;

    return closest.toolIndex;
  }

  _distanceFromPoint(
    viewport: Types.IViewport,
    data: any,
    coords: Types.Point2
  ): number {
    let distance = Infinity;

    for (let i = 0; i < data?.polyline?.length; i++) {
      const canvasPoint = viewport.worldToCanvas(data.polyline[i]);
      const distanceToPoint = point.distanceToPoint(canvasPoint, coords);

      distance = Math.min(distance, distanceToPoint);
    }

    // If an error caused distance not to be calculated, return -1.
    if (distance === Infinity) {
      return -1;
    }

    return distance;
  }

  /**
   * Attaches event listeners to the element such that is is visible, modifiable, and new data can be created.
   * @param element - - The viewport element to attach event listeners to.
   */
  _activateSculpt(element: HTMLDivElement): void {
    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
  }

  /**
   * Removes event listeners from the element.
   * @param element - The viewport element to remove event listeners from.
   */
  _deactivateSculpt(element: HTMLDivElement): void {
    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
  }

  _checkSpacing(
    i: number,
    points: Array<Types.Point3>,
    indicesToInsertAfter: Array<number>,
    maxSpacing: number
  ): void {
    const { element } = this._sculptData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const nextHandleIndex = this._getNextHandleIndex(i, points.length);

    const currentCanvasPoint = viewport.worldToCanvas(points[i]);
    const nextCanvasPoint = viewport.worldToCanvas(points[nextHandleIndex]);

    const distanceToNextHandle = point.distanceToPoint(
      currentCanvasPoint,
      nextCanvasPoint
    );

    if (distanceToNextHandle > maxSpacing) {
      indicesToInsertAfter.push(i);
    }
  }

  _getNextHandleIndex(i: number, length: number): number {
    if (i === length - 1) {
      return 0;
    }

    return i + 1;
  }

  _getNextHandleIndexBeforeInsert(insertIndex: number, length: number): number {
    if (insertIndex === length) {
      return 0;
    }

    return insertIndex;
  }
}

FreehandROISculptorTool.toolName = 'FreehandROISculptorTool';
export default FreehandROISculptorTool;
