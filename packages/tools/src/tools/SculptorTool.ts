import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { BaseTool } from './base';
import { getAnnotations } from '../stateManagement';
import {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  ContourAnnotation,
} from '../types';
import { point } from '../utilities/math';
import { Events, ToolModes, AnnotationStyleStates } from '../enums';
import { ToolGroupManager } from '../store';
import { triggerAnnotationRenderForViewportIds } from '../utilities/triggerAnnotationRenderForViewportIds';
import {
  hideElementCursor,
  resetElementCursor,
} from '../cursors/elementCursor';
import { StyleSpecifier } from '../types/AnnotationStyle';
import { getStyleProperty } from '../stateManagement/annotation/config/helpers';
import { triggerAnnotationModified } from '../stateManagement/annotation/helpers/state';
import CircleSculptCursor from './SculptorTool/CircleSculptCursor';
import type { ISculptToolShape } from '../types/ISculptToolShape';
import { distancePointToContour } from './distancePointToContour';

export type SculptData = {
  mousePoint: Types.Point3;
  mouseCanvasPoint: Types.Point2;
  points: Array<Types.Point3>;
  maxSpacing: number;
  element: HTMLDivElement;
};

type CommonData = {
  activeAnnotationUID: string | null;
  viewportIdsToRender: any[];
  isEditingOpenContour: boolean;
  canvasLocation: Types.Point2 | undefined;
};

/**
 * This tool allows modifying the contour data for planar freehand by sculpting
 * it externally using another shape to push the contour in one direction or the other.
 */
class SculptorTool extends BaseTool {
  static toolName: string;
  registeredShapes = new Map();
  private isActive = false;
  private selectedShape: string;
  private commonData: CommonData = {
    activeAnnotationUID: null,
    viewportIdsToRender: [],
    isEditingOpenContour: false,
    canvasLocation: undefined,
  };
  private sculptData?: SculptData;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        minSpacing: 1,
        referencedToolNames: [
          'PlanarFreehandROI',
          'PlanarFreehandContourSegmentationTool',
        ],
        toolShape: 'circle',
        referencedToolName: 'PlanarFreehandROI',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.registerShapes(CircleSculptCursor.shapeName, CircleSculptCursor);
    this.setToolShape(this.configuration.toolShape);
  }

  /**
   * Register different tool shapes for sculptor tool
   * @param shapeName name of shape
   * @param shapeClass shape class
   */
  registerShapes<T extends ISculptToolShape>(
    shapeName: string,
    shapeClass: new () => T
  ): void {
    const shape = new shapeClass();
    this.registeredShapes.set(shapeName, shape);
  }

  preMouseDownCallback = (evt: EventTypes.InteractionEventType): boolean => {
    const eventData = evt.detail;
    const element = eventData.element;

    this.configureToolSize(evt);
    this.selectFreehandTool(eventData);

    if (this.commonData.activeAnnotationUID === null) {
      return;
    }

    this.isActive = true;

    hideElementCursor(element);
    this.activateModify(element);
    return true;
  };

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    if (this.mode === ToolModes.Active) {
      this.configureToolSize(evt);
      this.updateCursor(evt);
    } else {
      this.commonData.canvasLocation = undefined;
    }
  };

  /**
   * Sculpts the freehand ROI with freehandSculpter tool, moving,
   * adding and removing handles as necessary.
   *
   * @param eventData - Data object associated with the event.
   * @param points - Array of points
   */
  protected sculpt(eventData: any, points: Array<Types.Point3>): void {
    const config = this.configuration;
    const element = eventData.element;

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const cursorShape = this.registeredShapes.get(this.selectedShape);

    this.sculptData = {
      mousePoint: eventData.currentPoints.world,
      mouseCanvasPoint: eventData.currentPoints.canvas,
      points,
      maxSpacing: cursorShape.getMaxSpacing(config.minSpacing),
      element: element,
    };

    const pushedHandles = cursorShape.pushHandles(viewport, this.sculptData);

    if (pushedHandles.first !== undefined) {
      this.insertNewHandles(pushedHandles);
    }
  }

  /**
   * Interpolates or fills in points between two points within a specified
   * maximum spacing constraint.
   */
  protected interpolatePointsWithinMaxSpacing(
    i: number,
    points: Array<Types.Point3>,
    indicesToInsertAfter: Array<number>,
    maxSpacing: number
  ): void {
    const { element } = this.sculptData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const nextHandleIndex = contourIndex(i + 1, points.length);

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

  /**
   * Updates cursor size
   *
   * @param evt - The event
   */
  private updateCursor(evt: EventTypes.InteractionEventType): void {
    const eventData = evt.detail;
    const element = eventData.element;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;

    this.commonData.viewportIdsToRender = [viewport.id];

    const annotations = this.filterSculptableAnnotationsForElement(element);

    if (!annotations?.length) {
      return;
    }

    const activeAnnotation = annotations.find(
      (annotation) =>
        annotation.annotationUID === this.commonData.activeAnnotationUID
    );

    this.commonData.canvasLocation = eventData.currentPoints.canvas;

    if (this.isActive) {
      activeAnnotation.highlighted = true;
    } else {
      const cursorShape = this.registeredShapes.get(this.selectedShape);
      const canvasCoords = eventData.currentPoints.canvas;
      cursorShape.updateToolSize(canvasCoords, viewport, activeAnnotation);
    }

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      this.commonData.viewportIdsToRender
    );
  }

  /**
   * Returns sculptable freehand ROI annotations
   *
   * @param element - The viewport element
   */
  private filterSculptableAnnotationsForElement(
    element: HTMLDivElement
  ): ContourAnnotation[] {
    const config = this.configuration;
    const enabledElement = getEnabledElement(element);
    const { renderingEngineId, viewportId } = enabledElement;
    const sculptableAnnotations = [];

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewportId,
      renderingEngineId
    );

    const toolInstance = toolGroup.getToolInstance(config.referencedToolName);

    config.referencedToolNames.forEach((referencedToolName: string) => {
      const annotations = getAnnotations(referencedToolName, element);
      if (annotations) {
        sculptableAnnotations.push(...annotations);
      }
    });

    return toolInstance.filterInteractableAnnotationsForElement(
      element,
      sculptableAnnotations
    );
  }

  /** Just pass the tool size interaction onto the internal tool size */
  private configureToolSize(evt: EventTypes.InteractionEventType): void {
    const cursorShape = this.registeredShapes.get(this.selectedShape);
    cursorShape.configureToolSize(evt);
  }

  /**
   * Inserts additional handles in sparsely sampled regions of the contour
   */
  private insertNewHandles(pushedHandles: {
    first: number;
    last: number | undefined;
  }): void {
    const indicesToInsertAfter = this.findNewHandleIndices(pushedHandles);
    let newIndexModifier = 0;
    for (let i = 0; i < indicesToInsertAfter?.length; i++) {
      const insertIndex = indicesToInsertAfter[i] + 1 + newIndexModifier;

      this.insertHandleRadially(insertIndex);
      newIndexModifier++;
    }
  }

  /**
   * Returns an array of indicies that describe where new handles should be inserted
   *
   * @param pushedHandles - The first and last handles that were pushed.
   */
  private findNewHandleIndices(pushedHandles: {
    first: number | undefined;
    last: number | undefined;
  }): Array<number> {
    const { points, maxSpacing } = this.sculptData;
    const indicesToInsertAfter = [];

    for (let i = pushedHandles.first; i <= pushedHandles.last; i++) {
      this.interpolatePointsWithinMaxSpacing(
        i,
        points,
        indicesToInsertAfter,
        maxSpacing
      );
    }

    return indicesToInsertAfter;
  }

  /**
   * Inserts a handle on the surface of the circle defined by toolSize and the mousePoint.
   *
   * @param insertIndex - The index to insert the new handle.
   */
  private insertHandleRadially(insertIndex: number): void {
    const { points } = this.sculptData;

    if (
      insertIndex > points.length - 1 &&
      this.commonData.isEditingOpenContour
    ) {
      return;
    }

    const cursorShape = this.registeredShapes.get(this.selectedShape);

    const previousIndex = insertIndex - 1;
    const nextIndex = contourIndex(insertIndex, points.length);
    const insertPosition = cursorShape.getInsertPosition(
      previousIndex,
      nextIndex,
      this.sculptData
    );
    const handleData = insertPosition;

    points.splice(insertIndex, 0, handleData);
  }

  /**
   * Select the freehand tool to be edited
   *
   * @param eventData - Data object associated with the event.
   */
  private selectFreehandTool(eventData: any): void {
    const closestAnnotationUID =
      this.getClosestFreehandToolOnElement(eventData);

    if (closestAnnotationUID === undefined) {
      return;
    }

    this.commonData.activeAnnotationUID = closestAnnotationUID;
  }

  /**
   * Finds the nearest handle to the mouse cursor for all freehand
   * data on the element.
   *
   * @param eventData - Data object associated with the event.
   */
  private getClosestFreehandToolOnElement(eventData: any): string {
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const config = this.configuration;

    const annotations = this.filterSculptableAnnotationsForElement(element);

    if (!annotations?.length) {
      return;
    }

    const canvasPoints = eventData.currentPoints.canvas;

    const closest = {
      distance: Infinity,
      toolIndex: undefined,
      annotationUID: undefined,
    };

    for (let i = 0; i < annotations?.length; i++) {
      if (annotations[i].isLocked || !annotations[i].isVisible) {
        continue;
      }

      const distanceFromTool = distancePointToContour(
        viewport,
        annotations[i],
        canvasPoints
      );

      if (distanceFromTool === -1) {
        continue;
      }

      if (distanceFromTool < closest.distance) {
        closest.distance = distanceFromTool;
        closest.toolIndex = i;
        closest.annotationUID = annotations[i].annotationUID;
      }
    }

    this.commonData.isEditingOpenContour =
      !annotations[closest.toolIndex].data.contour.closed;

    config.referencedToolName =
      annotations[closest.toolIndex].metadata.toolName;

    return closest.annotationUID;
  }

  /**
   * Event handler for MOUSE_UP during the active loop.
   *
   * @param evt - The event
   */
  private endCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ): void => {
    const eventData = evt.detail;
    const { element } = eventData;
    const config = this.configuration;
    const enabledElement = getEnabledElement(element);

    this.isActive = false;
    this.deactivateModify(element);
    resetElementCursor(element);

    const { renderingEngineId, viewportId } = enabledElement;

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewportId,
      renderingEngineId
    );

    const toolInstance = toolGroup.getToolInstance(config.referencedToolName);

    const annotations = this.filterSculptableAnnotationsForElement(element);

    const activeAnnotation = annotations.find(
      (annotation) =>
        annotation.annotationUID === this.commonData.activeAnnotationUID
    );

    if (toolInstance.configuration.calculateStats) {
      activeAnnotation.invalidated = true;
    }

    triggerAnnotationModified(activeAnnotation, element);
  };

  /**
   * Event handler for MOUSE_DRAG during the active loop.
   *
   * @param evt - The event
   */
  private dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const element = eventData.element;

    this.updateCursor(evt);

    const annotations = this.filterSculptableAnnotationsForElement(element);
    const activeAnnotation = annotations.find(
      (annotation) =>
        annotation.annotationUID === this.commonData.activeAnnotationUID
    );

    if (!annotations?.length || !this.isActive) {
      return;
    }

    const points = activeAnnotation.data.contour.polyline;

    this.sculpt(eventData, points);
  };

  /**
   * Attaches event listeners to the element such that is is visible, modifiable, and new data can be created.
   * @param element - - The viewport element to attach event listeners to.
   */
  protected activateModify(element: HTMLDivElement): void {
    element.addEventListener(
      Events.MOUSE_UP,
      this.endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this.endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this.dragCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_TAP,
      this.endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_END,
      this.endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this.dragCallback as EventListener
    );
  }

  /**
   * Removes event listeners from the element.
   * @param element - The viewport element to remove event listeners from.
   */
  protected deactivateModify(element: HTMLDivElement): void {
    element.removeEventListener(
      Events.MOUSE_UP,
      this.endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this.endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this.dragCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_TAP,
      this.endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_END,
      this.endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this.dragCallback as EventListener
    );
  }

  /**
   * Sets the tool shape to the specified tool
   */
  public setToolShape(toolShape: string): void {
    this.selectedShape =
      this.registeredShapes.get(toolShape) ?? CircleSculptCursor.shapeName;
  }

  /**
   * Renders the cursor annotation on screen so that the user can choose the
   * annotation size.
   */
  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): void {
    const { viewport } = enabledElement;
    const { element } = viewport;

    const viewportIdsToRender = this.commonData.viewportIdsToRender;

    if (
      !this.commonData.canvasLocation ||
      this.mode !== ToolModes.Active ||
      !viewportIdsToRender.includes(viewport.id)
    ) {
      return;
    }

    const annotations = this.filterSculptableAnnotationsForElement(element);

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

    const cursorShape = this.registeredShapes.get(this.selectedShape);

    cursorShape.renderShape(svgDrawingHelper, this.commonData.canvasLocation, {
      color,
    });
  }
}

/**
 * Function calculates the index of a contour given a position `i` and the length of the contour.
 * It ensures that the resulting index is within the bounds of the contour by wrapping around if needed.
 * This function is useful for obtaining neighboring indices or other related indices within the contour,
 * such as for navigating or accessing elements in a circular or looped structure
 */
export const contourIndex = (i: number, length: number): number => {
  return (i + length) % length;
};

SculptorTool.toolName = 'SculptorTool';
export default SculptorTool;
