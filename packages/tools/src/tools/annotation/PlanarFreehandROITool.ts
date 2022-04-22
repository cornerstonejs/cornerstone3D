import {
  getEnabledElement,
  cache,
  StackViewport,
  Settings,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import {
  addAnnotation,
  getAnnotations,
} from '../../stateManagement/annotation/annotationState';
import { polyline } from '../../utilities/math';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import registerDrawLoop from './planarFreehandROITool/drawLoop';
import registerClosedContourEditLoop from './planarFreehandROITool/closedContourEditLoop';
import registerOpenContourEditLoop from './planarFreehandROITool/openContourEditLoop';
import registerOpenContourEndEditLoop from './planarFreehandROITool/openContourEndEditLoop';
import registerRenderMethods from './planarFreehandROITool/renderMethods';

import {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
  Annotation,
} from '../../types';

const { pointCanProjectOnLine } = polyline;

/**
 * PlanarFreehandROITool lets you draw annotations that measures the area of a arbitrarily drawn region.
 * You can use the PlanarFreehandROITool in all perpendicular views (axial, sagittal, coronal).
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * ```js
 * cornerstoneTools.addTool(PlanarFreehandROITool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(PlanarFreehandROITool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
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

class PlanarFreehandROITool extends AnnotationTool {
  static toolName: string = 'PlanarFreehandROI';

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  private commonData?: {
    annotation: Types.Annotation;
    viewportIdsToRender: string[];
    spacing: Types.Point2;
    xDir: Types.Point3;
    yDir: Types.Point3;
  };
  private drawData?: {
    polylineIndex: number;
    canvasPoints: Types.Point2[];
  } | null;
  private closedContourEditData?: {
    prevCanvasPoints: Types.Point2[];
    editCanvasPoints: Types.Point2[];
    startCrossingPoint?: Types.Point2;
    endCrossingPoint?: Types.Point2;
    startEditCrossPoint?: Types.Point2;
    editIndex: number;
    snapIndex?: number;
  } | null;
  private openContourEditData?: {
    polylineIndex?: number;
  } | null;
  isDrawing: boolean = false;
  isEditingClosed: boolean = false;
  isEditingOpen: boolean = false;

  private activateDraw: (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: Types.Annotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateClosedContourEdit: (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: Types.Annotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateOpenContourEdit: (element: HTMLDivElement) => void;
  private activateOpenContourEndEdit: (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: Types.Annotation,
    viewportIdsToRender: string[]
  ) => void;

  private renderContour: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: Annotation
  ) => void;
  private renderContourBeingDrawn: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: Annotation
  ) => void;
  private renderClosedContourBeingEdited: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: Annotation
  ) => void;
  private renderOpenContourBeingEdited: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any,
    annotation: Annotation
  ) => void;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        allowOpenContours: true,
        closeContourProximity: 10,
        subPixelResolution: 2,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    registerDrawLoop(this);
    registerClosedContourEditLoop(this);
    registerOpenContourEditLoop(this);
    registerOpenContourEndEditLoop(this);
    registerRenderMethods(this);
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Length Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): Annotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    let referencedImageId;
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId();
    } else {
      const volumeId = this.getTargetId(viewport);
      const imageVolume = cache.getVolume(volumeId);
      referencedImageId = csUtils.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal,
        viewUp
      );
    }

    if (referencedImageId) {
      const colonIndex = referencedImageId.indexOf(':');
      referencedImageId = referencedImageId.substring(colonIndex + 1);
    }

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.getToolName(),
      },
      data: {
        handles: {
          points: [], // Handle points for open contours
          activeHandleIndex: null,
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
        },
        polyline: [<Types.Point3>[...worldPos]], // Polyline coordinates
        label: '',
        cachedStats: {},
      },
    };
    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, PlanarFreehandROITool);
    addAnnotation(element, annotation);

    this.activateDraw(evt, annotation, viewportIdsToRender);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * Executes the callback for when mouse has selected a handle (anchor point) of
   * the bidirectional tool or when the text box has been selected.
   *
   * @param evt - EventTypes.MouseDownEventType
   * @param annotation - Bidirectional annotation
   * @param handle - Handle index or selected textBox information
   * @param interactionType - interaction type (mouse, touch)
   */
  handleSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: Annotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.activateOpenContourEndEdit(evt, annotation, viewportIdsToRender);
  };

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: Annotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    if (annotation.data.isOpenContour) {
      this.activateOpenContourEdit(element);
    } else {
      this.activateClosedContourEdit(evt, annotation, viewportIdsToRender);
    }
  };

  /**
   * It returns if the canvas point is near the provided length annotation in the provided
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
    element: HTMLDivElement,
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const points = annotation.data.polyline;

    // NOTE: It is implemented this way so that we do not double calculate
    // points when number crunching adjacent line segments.
    let previousPoint = viewport.worldToCanvas(points[0]);

    for (let i = 1; i < points.length; i++) {
      const p1 = previousPoint;
      const p2 = viewport.worldToCanvas(points[i]);

      let distance = pointCanProjectOnLine(canvasCoords, p1, p2, proximity);

      if (distance) {
        return true;
      }

      previousPoint = p2;
    }

    if (annotation.data.isOpenContour) {
      // Contour is open, don't check last point to first point.
      return false;
    }

    // check last point to first point
    const pStart = viewport.worldToCanvas(points[0]);
    const pEnd = viewport.worldToCanvas(points[points.length - 1]);

    let distance = pointCanProjectOnLine(canvasCoords, pStart, pEnd, proximity);

    if (distance) {
      return true;
    }

    return false;
  };

  cancel = (element: HTMLDivElement) => {
    // TODO CANCEL
  };

  /**
   * it is used to draw the length annotation in each
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
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(element, this.getToolName());

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
    if (!annotations?.length) {
      return;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return;
    }

    const isDrawing = this.isDrawing;
    const isEditingOpen = this.isEditingOpen;
    const isEditingClosed = this.isEditingClosed;

    if (!(isDrawing || isEditingOpen || isEditingClosed)) {
      annotations.forEach((annotation) =>
        this.renderContour(enabledElement, svgDrawingHelper, annotation)
      );

      return;
    }

    const activeAnnotationUID = this.commonData.annotation.annotationUID;

    annotations.forEach((annotation) => {
      if (annotation.annotationUID === activeAnnotationUID) {
        if (isDrawing) {
          this.renderContourBeingDrawn(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else if (isEditingClosed) {
          this.renderClosedContourBeingEdited(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else if (isEditingOpen) {
          this.renderOpenContourBeingEdited(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else {
          throw new Error(
            `Unknown ${this.getToolName()} annotation rendering state`
          );
        }
      } else {
        this.renderContour(enabledElement, svgDrawingHelper, annotation);
      }
    });
  };
}

export default PlanarFreehandROITool;
