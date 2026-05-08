import { getEnabledElement, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import { BaseTool } from './base';
import { getAnnotations, getAnnotation } from '../stateManagement';
import type {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  ContourAnnotation,
} from '../types';
import { point } from '../utilities/math';
import {
  Events,
  ToolModes,
  AnnotationStyleStates,
  ChangeTypes,
} from '../enums';
import { triggerAnnotationRenderForViewportIds } from '../utilities/triggerAnnotationRenderForViewportIds';
import {
  hideElementCursor,
  resetElementCursor,
} from '../cursors/elementCursor';
import type { StyleSpecifier } from '../types/AnnotationStyle';
import { getStyleProperty } from '../stateManagement/annotation/config/helpers';
import { triggerAnnotationModified } from '../stateManagement/annotation/helpers/state';
import CircleSculptCursor from './SculptorTool/CircleSculptCursor';
import type { ISculptToolShape } from '../types/ISculptToolShape';
import { distancePointToContour } from './distancePointToContour';
import { getToolGroupForViewport } from '../store/ToolGroupManager';
import { getSignedArea, containsPoint } from '../utilities/math/polyline';

const { isEqual } = utilities;

export type Contour = {
  annotationUID: string;
  points: Array<Types.Point3>;
};

export type SculptData = {
  mousePoint: Types.Point3;
  mouseCanvasPoint: Types.Point2;
  points: Array<Types.Point3>;
  maxSpacing: number;
  element: HTMLDivElement;
  contours: Contour[];
};

export type SculptIntersect = {
  annotationUID: string;
  isEnter: boolean;
  index: number;
  relIndex?: number;
  point: Types.Point3;
  angle: number;
};

export type ContourSelection = Array<SculptIntersect>;

type CommonData = {
  activeAnnotationUID: string | null;
  viewportIdsToRender: string[];
  isEditingOpenContour: boolean;
  canvasLocation: Types.Point2 | undefined;
  external: boolean;
  closed: boolean | undefined;
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
    external: true,
    closed: false,
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
        updateCursorSize: 'dynamic',
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
    const { element } = eventData;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      contours: [
        {
          annotationUID: this.commonData.activeAnnotationUID,
          points,
        },
      ],
    };

    const intersections = this.intersect(viewport, cursorShape);
    if (!intersections.length) {
      return;
    }
    // console.warn('intersections=', JSON.stringify(intersections, null, 2));
    const contourSelections = this.getContourSelections(
      intersections,
      points.length
    );

    const { closed } = this.commonData;
    for (const contour of contourSelections) {
      const newPoints = new Array<Types.Point3>();
      const lastExit = contour[contour.length - 1];
      let lastIndex = closed ? lastExit.relIndex : 0;
      let lastEnter;
      for (const intersection of contour) {
        if (intersection.isEnter) {
          pushArr(newPoints, points, lastIndex, intersection.index);
          lastEnter = intersection;
        } else {
          this.interpolatePoints(
            viewport,
            lastEnter,
            intersection,
            points,
            newPoints
          );
        }
        lastIndex = intersection.index;
      }
      if (contourSelections.length > 1) {
        const signedArea = getSignedArea(newPoints.map(viewport.worldToCanvas));
        if (signedArea < 0) {
          console.warn('Skipping internal area');
          continue;
        }
      }
      if (!closed && lastIndex < points.length - 1) {
        pushArr(newPoints, points, lastIndex);
      }
      points.splice(0, points.length);
      pushArr(points, newPoints);
      return;
    }
  }
  /**
   * This will return an array of EVEN length, containing ordered
   * entry/exit points for where the given contour(s) enter the cursor region
   * and leave the cursor region.
   */
  public intersect(viewport: Types.IViewport, cursorShape): SculptIntersect[] {
    const { contours, mousePoint, mouseCanvasPoint } = this.sculptData;
    const { closed } = this.commonData;

    cursorShape.computeWorldRadius(viewport);
    const result = new Array<SculptIntersect>();

    for (const contour of contours) {
      const { annotationUID, points } = contour;
      let lastIn = false;
      let anyIn = false;
      let anyOut = false;
      const { length } = points;
      for (let i = 0; i <= length; i++) {
        const index = i % length;
        const point = points[index];
        const inCursor = cursorShape.isInCursor(point, mousePoint);
        anyIn ||= inCursor;
        anyOut ||= !inCursor;
        if (i === 0) {
          lastIn = inCursor;
          if (!closed && inCursor) {
            const edge = cursorShape.getEdge(
              viewport,
              point,
              null,
              mouseCanvasPoint
            );
            result.push({
              annotationUID,
              isEnter: inCursor,
              index: i,
              point: edge.point,
              angle: edge.angle,
            });
          }
          continue;
        }
        if (index === 0 && !closed) {
          if (lastIn) {
            const edge = cursorShape.getEdge(
              viewport,
              points[length - 1],
              null,
              mouseCanvasPoint
            );
            result.push({
              annotationUID,
              isEnter: false,
              index: length - 1,
              point: edge.point,
              angle: edge.angle,
            });
          }
          continue;
        }
        if (lastIn === inCursor) {
          continue;
        }
        lastIn = inCursor;
        const edge = cursorShape.getEdge(
          viewport,
          point,
          points[i - 1],
          mouseCanvasPoint
        );
        result.push({
          annotationUID,
          isEnter: inCursor,
          index: i,
          point: edge.point,
          angle: edge.angle,
        });
      }
    }

    return result;
  }

  public interpolatePoints(viewport, enter, exit, existing, newPoints) {
    const { external, closed } = this.commonData;
    const p0 = existing[enter.index % existing.length];
    const p1 = existing[exit.index % existing.length];

    const v = vec3.sub(vec3.create(), p1, p0);
    if (isEqual(vec3.length(v), 0)) {
      return;
    }

    const cursorShape = this.registeredShapes.get(this.selectedShape);
    const a0 = (enter.angle + 2 * Math.PI) % (Math.PI * 2);
    const a1 = (exit.angle + 2 * Math.PI) % (Math.PI * 2);
    let ae = a1 < a0 ? a1 + 2 * Math.PI : a1;
    const aeAlt = a1 > a0 ? a1 - 2 * Math.PI : a1;
    if (
      (external && !closed && Math.abs(aeAlt - a0) < Math.abs(ae - a0)) ||
      (external && closed)
    ) {
      // Go the other way round as it is shorter
      ae = aeAlt;
    }
    const count = Math.ceil(Math.abs(a0 - ae) / 0.25);
    for (let i = 0; i <= count; i++) {
      const a = (a0 * (count - i) + i * ae) / count;
      newPoints.push(
        cursorShape.interpolatePoint(
          viewport,
          a,
          this.sculptData.mouseCanvasPoint
        )
      );
    }
  }

  /**
   * Creates a set of intersection selection objects
   */
  public getContourSelections(intersections, pointLength) {
    const result = new Array<ContourSelection>();
    const enterLength = intersections.length / 2;
    if (!enterLength || intersections.length % 2) {
      return result;
    }
    let lastAngle = Number.NEGATIVE_INFINITY;
    for (let enterCount = 0; enterCount < enterLength; enterCount++) {
      const enter = this.findNext(intersections, lastAngle);
      if (!enter) {
        console.error("Couldnt' find an entry");
        continue;
      }
      const exit = this.findNext(intersections, enter.angle, false);
      if (!exit) {
        console.error("Couldn't find an exit for", enter);
        continue;
      }
      exit.relIndex ||=
        exit.index < enter.index ? exit.index + pointLength : exit.index;
      result.push([enter, exit]);
    }

    // Sort by increasing index
    result.sort((a, b) => a[0].index - b[0].index);
    for (let i = 0; i < result.length - 1; ) {
      const testIntersection = result[i];
      const mergeableResult = this.findMergeable(result, testIntersection, i);
      if (mergeableResult) {
        testIntersection.push(...mergeableResult);
      } else {
        i++;
      }
    }

    if (result.length > 1) {
      console.warn('************* More than 1 result', result);
    }

    return result;
  }

  public findMergeable(contours, testIntersection, currentIndex) {
    const end = testIntersection[testIntersection.length - 1];
    for (let i = currentIndex + 1; i < contours.length; i++) {
      const [enter] = contours[i];
      if (enter.index >= end.relIndex) {
        const contour = contours[i];
        contours.splice(i, 1);
        return contour;
      }
    }
  }

  public findNext(intersections, lastAngle, isEnter = true) {
    if (intersections.length === 1) {
      const [intersection] = intersections;
      intersections.splice(0, 1);
      return intersection;
    }
    let foundItem;
    let testAngle;
    for (let i = 0; i < intersections.length; i++) {
      const intersection = intersections[i];
      if (intersection.isEnter == isEnter) {
        const relativeAngle =
          (intersection.angle - lastAngle + 2 * Math.PI) % (2 * Math.PI);
        if (!foundItem || relativeAngle < testAngle) {
          foundItem = { i, intersection };
          testAngle = relativeAngle;
        }
      }
    }
    if (!foundItem) {
      console.warn(
        "Couldn't find an exit point for entry",
        JSON.stringify(intersections)
      );
      return;
    }
    intersections.splice(foundItem.i, 1);
    const { intersection } = foundItem;
    return intersection;
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
    const { viewport } = enabledElement;

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

      // Only call updateToolSize when updateCursorSize is set to 'dynamic'
      if (this.configuration.updateCursorSize === 'dynamic') {
        cursorShape.updateToolSize(canvasCoords, viewport, activeAnnotation);
      }
    }

    triggerAnnotationRenderForViewportIds(this.commonData.viewportIdsToRender);
  }

  /**
   * Gets the tool instance on the configured tool
   */
  protected getToolInstance(element: HTMLDivElement) {
    const enabledElement = getEnabledElement(element);
    const { renderingEngineId, viewportId } = enabledElement;
    const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);

    const toolInstance = toolGroup.getToolInstance(
      this.configuration.referencedToolName
    );
    return toolInstance;
  }

  /**
   * Returns sculptable freehand ROI annotations
   *
   * @param element - The viewport element
   */
  private filterSculptableAnnotationsForElement(
    element: HTMLDivElement
  ): ContourAnnotation[] {
    const { configuration } = this;
    const sculptableAnnotations = [];
    const toolInstance = this.getToolInstance(element);

    configuration.referencedToolNames.forEach((referencedToolName: string) => {
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
   * Select the freehand tool to be edited
   *
   * @param eventData - Data object associated with the event.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private selectFreehandTool(eventData: any): void {
    const closestAnnotationUID =
      this.getClosestFreehandToolOnElement(eventData);

    if (closestAnnotationUID === undefined) {
      return;
    }

    const annotation = getAnnotation(closestAnnotationUID);
    this.commonData.activeAnnotationUID = closestAnnotationUID;
    this.commonData.closed = annotation.data.contour.closed;
    this.commonData.external = true;
    if (this.commonData.closed) {
      const { element } = eventData;
      const enabledElement = getEnabledElement(element);
      const { viewport } = enabledElement;
      const polyline = annotation.data.contour.polyline.map((p) =>
        viewport.worldToCanvas(p)
      );
      const canvasPoint = eventData.currentPoints.canvas;
      this.commonData.external = !containsPoint(polyline, canvasPoint, {
        closed: true,
      });
    }
  }

  /**
   * Finds the nearest handle to the mouse cursor for all freehand
   * data on the element.
   *
   * @param eventData - Data object associated with the event.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    this.isActive = false;
    this.deactivateModify(element);
    resetElementCursor(element);

    const toolInstance = this.getToolInstance(element);
    toolInstance.doneEditMemo?.();

    const annotations = this.filterSculptableAnnotationsForElement(element);

    const activeAnnotation = annotations.find(
      (annotation) =>
        annotation.annotationUID === this.commonData.activeAnnotationUID
    );

    if (toolInstance.configuration.calculateStats) {
      activeAnnotation.invalidated = true;
    }

    triggerAnnotationModified(
      activeAnnotation,
      element,
      ChangeTypes.HandlesUpdated
    );
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
    const annotation = getAnnotation(this.commonData.activeAnnotationUID);
    const instance = this.getToolInstance(element);
    instance.createMemo?.(element, annotation);
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

function pushArr(dest, src, start = 0, end = src.length) {
  if (end < start) {
    end = end + src.length;
  }
  for (let i = start; i < end; i++) {
    dest.push(src[i % src.length]);
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
