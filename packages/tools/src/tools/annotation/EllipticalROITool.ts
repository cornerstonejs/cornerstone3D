import { AnnotationTool } from '../base';

import {
  getEnabledElement,
  VolumeViewport,
  utilities as csUtils,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { getCalibratedLengthUnitsAndScale } from '../../utilities/getCalibratedUnits';
import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import {
  drawCircle as drawCircleSvg,
  drawEllipseByCoordinates as drawEllipseSvg,
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store/state';
import { ChangeTypes, Events } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import getWorldWidthAndHeightFromTwoPoints from '../../utilities/planar/getWorldWidthAndHeightFromTwoPoints';
import {
  pointInEllipse,
  getCanvasEllipseCorners,
} from '../../utilities/math/ellipse';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';
import type {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
} from '../../types';
import type { EllipticalROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { getPixelValueUnits } from '../../utilities/getPixelValueUnits';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';
import { BasicStatsCalculator } from '../../utilities/math/basic';

const { transformWorldToIndex } = csUtils;

/**
 * EllipticalROITool let you draw annotations that measures the statistics
 * such as area, max, mean and stdDev of an elliptical region of interest.
 * You can use EllipticalROITool in all perpendicular views (axial, sagittal, coronal).
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference. Elliptical tool's text box lines are dynamically
 * generated based on the viewport's underlying Modality. For instance, if
 * the viewport is displaying CT, the text box will shown the statistics in Hounsfield units,
 * and if the viewport is displaying PET, the text box will show the statistics in
 * SUV units.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * Changing tool configuration (see below) you can make the tool to draw the center
 * point circle with a given radius.
 *
 * ```js
 * cornerstoneTools.addTool(EllipticalROITool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(EllipticalROITool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(EllipticalROITool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 *
 * // draw a circle at the center point with 4px radius.
 * toolGroup.setToolConfiguration(EllipticalROITool.toolName, {
 *   centerPointRadius: 4,
 * });
 * ```
 *
 * Read more in the Docs section of the website.
 */

class EllipticalROITool extends AnnotationTool {
  static toolName = 'EllipticalROI';

  _throttledCalculateCachedStats: Function;
  editData: {
    annotation: Annotation;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    movingTextBox?: boolean;
    centerWorld?: Array<number>;
    canvasWidth?: number;
    canvasHeight?: number;
    originalHandleCanvas?: Array<number>;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        // Whether to store point data in the annotation
        storePointData: false,
        // Radius of the circle to draw  at the center point of the ellipse.
        // Set this zero(0) in order not to draw the circle.
        centerPointRadius: 0,
        getTextLines: defaultGetTextLines,
        statsCalculator: BasicStatsCalculator,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  static hydrate = (
    viewportId: string,
    points: Types.Point3[],
    options?: {
      annotationUID?: string;
      toolInstance?: EllipticalROITool;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): EllipticalROIAnnotation => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement) {
      return;
    }
    const {
      FrameOfReferenceUID,
      referencedImageId,
      viewPlaneNormal,
      instance,
      viewport,
    } = this.hydrateBase<EllipticalROITool>(
      EllipticalROITool,
      enabledElement,
      points,
      options
    );

    const annotation = {
      annotationUID: options?.annotationUID || csUtils.uuidv4(),
      data: {
        handles: {
          points,
          activeHandleIndex: null,
        },
        label: '',
        cachedStats: {},
      },
      highlighted: false,
      autoGenerated: false,
      invalidated: false,
      isLocked: false,
      isVisible: true,
      metadata: {
        toolName: instance.getToolName(),
        viewPlaneNormal,
        FrameOfReferenceUID,
        referencedImageId,
        ...options,
      },
    };

    addAnnotation(annotation, viewport.element);

    triggerAnnotationRenderForViewportIds([viewport.id]);
  };

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a EllipticalROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): EllipticalROIAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
        ...viewport.getViewReference({ points: [worldPos] }),
      },
      data: {
        label: '',
        handles: {
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
          points: [
            [...worldPos],
            [...worldPos],
            [...worldPos],
            [...worldPos],
          ] as [Types.Point3, Types.Point3, Types.Point3, Types.Point3],
          activeHandleIndex: null,
        },
        cachedStats: {},
        initialRotation: viewport.getRotation(),
      },
    };

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      centerWorld: worldPos,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return annotation;
  };

  /**
   * It returns if the canvas point is near the provided annotation in the provided
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
    annotation: EllipticalROIAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const { points } = data.handles;

    // For some reason Typescript doesn't understand this, so we need to be
    // more specific about the type
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p)) as [
      Types.Point2,
      Types.Point2,
      Types.Point2,
      Types.Point2
    ];
    const canvasCorners = getCanvasEllipseCorners(canvasCoordinates);

    const [canvasPoint1, canvasPoint2] = canvasCorners;

    const minorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) + proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) + proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) - proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) - proximity,
    };

    const majorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) - proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) - proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) + proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) + proximity,
    };

    const pointInMinorEllipse = this._pointInEllipseCanvas(
      minorEllipse,
      canvasCoords
    );
    const pointInMajorEllipse = this._pointInEllipseCanvas(
      majorEllipse,
      canvasCoords
    );

    if (pointInMajorEllipse && !pointInMinorEllipse) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: EllipticalROIAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      movingTextBox: false,
    };

    hideElementCursor(element);

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: EllipticalROIAnnotation,
    handle: ToolHandle
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    let movingTextBox = false;
    let handleIndex;

    let centerCanvas;
    let centerWorld;
    let canvasWidth;
    let canvasHeight;
    let originalHandleCanvas;

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      const { points } = data.handles;
      const { viewport } = getEnabledElement(element);
      const { worldToCanvas, canvasToWorld } = viewport;

      handleIndex = points.findIndex((p) => p === handle);

      const pointsCanvas = points.map(worldToCanvas);

      originalHandleCanvas = pointsCanvas[handleIndex];

      canvasWidth = Math.abs(pointsCanvas[2][0] - pointsCanvas[3][0]);
      canvasHeight = Math.abs(pointsCanvas[0][1] - pointsCanvas[1][1]);

      centerCanvas = [
        (pointsCanvas[2][0] + pointsCanvas[3][0]) / 2,
        (pointsCanvas[0][1] + pointsCanvas[1][1]) / 2,
      ];

      centerWorld = canvasToWorld(centerCanvas);
    }

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
      canvasWidth,
      canvasHeight,
      centerWorld,
      originalHandleCanvas,
      movingTextBox,
    };
    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      return;
    }

    this.doneEditMemo();

    // Elliptical ROI tool should reset its highlight to false on mouse up (as opposed
    // to other tools that keep it highlighted until the user moves. The reason
    // is that we use top-left and bottom-right handles to define the ellipse,
    // and they are by definition not in the ellipse on mouse up.
    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    resetElementCursor(element);

    this.editData = null;
    this.isDrawing = false;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }
  };

  _dragDrawCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    //////
    const { annotation, viewportIdsToRender, centerWorld, newAnnotation } =
      this.editData;
    this.createMemo(element, annotation, { newAnnotation });

    const centerCanvas = viewport.worldToCanvas(centerWorld as Types.Point3);
    const { data } = annotation;

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0]);
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1]);

    // Todo: why bottom is -dY, it should be +dY
    const bottomCanvas = <Types.Point2>[centerCanvas[0], centerCanvas[1] - dY];
    const topCanvas = <Types.Point2>[centerCanvas[0], centerCanvas[1] + dY];
    const leftCanvas = <Types.Point2>[centerCanvas[0] - dX, centerCanvas[1]];
    const rightCanvas = <Types.Point2>[centerCanvas[0] + dX, centerCanvas[1]];

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ];

    annotation.invalidated = true;

    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
    triggerAnnotationModified(annotation, element, ChangeTypes.HandlesUpdated);
  };

  _dragModifyCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
      newAnnotation,
    } = this.editData;
    this.createMemo(element, annotation, { newAnnotation });
    const { data } = annotation;

    if (movingTextBox) {
      const { deltaPoints } = eventDetail;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      this._dragHandle(evt);
      annotation.invalidated = true;
    }

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (annotation.invalidated) {
      triggerAnnotationModified(
        annotation,
        element,
        ChangeTypes.HandlesUpdated
      );
    }
  };

  _dragHandle = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { viewport } = getEnabledElement(element);
    const { canvasToWorld, worldToCanvas } = viewport;

    const {
      annotation,
      canvasWidth,
      canvasHeight,
      handleIndex,
      centerWorld,
      originalHandleCanvas,
    } = this.editData;
    const centerCanvas = viewport.worldToCanvas(centerWorld as Types.Point3);
    const { data } = annotation;
    const { points } = data.handles;

    // Move current point in that direction.
    // Move other points in opposite direction.

    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;

    if (handleIndex === 0 || handleIndex === 1) {
      // Dragging top or bottom point
      const dYCanvas = Math.abs(currentCanvasPoints[1] - centerCanvas[1]);
      const canvasBottom = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] - dYCanvas,
      ];
      const canvasTop = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] + dYCanvas,
      ];

      points[0] = canvasToWorld(canvasBottom);
      points[1] = canvasToWorld(canvasTop);

      const dXCanvas = currentCanvasPoints[0] - originalHandleCanvas[0];
      const newHalfCanvasWidth = canvasWidth / 2 + dXCanvas;
      const canvasLeft = <Types.Point2>[
        centerCanvas[0] - newHalfCanvasWidth,
        centerCanvas[1],
      ];
      const canvasRight = <Types.Point2>[
        centerCanvas[0] + newHalfCanvasWidth,
        centerCanvas[1],
      ];

      points[2] = canvasToWorld(canvasLeft);
      points[3] = canvasToWorld(canvasRight);
    } else {
      // Dragging left or right point
      const dXCanvas = Math.abs(currentCanvasPoints[0] - centerCanvas[0]);
      const canvasLeft = <Types.Point2>[
        centerCanvas[0] - dXCanvas,
        centerCanvas[1],
      ];
      const canvasRight = <Types.Point2>[
        centerCanvas[0] + dXCanvas,
        centerCanvas[1],
      ];

      points[2] = canvasToWorld(canvasLeft);
      points[3] = canvasToWorld(canvasRight);

      const dYCanvas = currentCanvasPoints[1] - originalHandleCanvas[1];
      const newHalfCanvasHeight = canvasHeight / 2 + dYCanvas;
      const canvasBottom = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] - newHalfCanvasHeight,
      ];
      const canvasTop = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] + newHalfCanvasHeight,
      ];

      points[0] = canvasToWorld(canvasBottom);
      points[1] = canvasToWorld(canvasTop);
    }
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      triggerAnnotationRenderForViewportIds(viewportIdsToRender);

      if (newAnnotation) {
        triggerAnnotationCompleted(annotation);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragDrawCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragDrawCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the ellipticalROI annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const targetId = this.getTargetId(viewport);

    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as EllipticalROIAnnotation;
      const { annotationUID, data } = annotation;
      const { handles } = data;
      const { points, activeHandleIndex } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Types.Point2, Types.Point2, Types.Point2, Types.Point2];

      const canvasCorners = <Array<Types.Point2>>(
        getCanvasEllipseCorners(canvasCoordinates) // bottom, top, left, right, keep as is
      );

      const { centerPointRadius } = this.configuration;
      // If cachedStats does not exist, or the unit is missing (as part of import/hydration etc.),
      // force to recalculate the stats from the points
      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].areaUnit == null
      ) {
        data.cachedStats[targetId] = {
          Modality: null,
          area: null,
          max: null,
          mean: null,
          stdDev: null,
          areaUnit: null,
        };

        this._calculateCachedStats(annotation, viewport, renderingEngine);
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          viewport,
          renderingEngine,
          enabledElement
        );
        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related viewports data, so that
        // when scrolling to the related slice in which the tool were manipulated
        // we re-render the correct tool position. This is due to stackViewport
        // which doesn't have the full volume at each time, and we are only working
        // on one slice at a time.
        if (viewport instanceof VolumeViewport) {
          const { referencedImageId } = annotation.metadata;

          // invalidate all the relevant stackViewports if they are not
          // at the referencedImageId
          for (const targetId in data.cachedStats) {
            if (targetId.startsWith('imageId')) {
              const viewports = renderingEngine.getStackViewports();

              const invalidatedStack = viewports.find((vp) => {
                // The stack viewport that contains the imageId but is not
                // showing it currently
                const referencedImageURI =
                  csUtils.imageIdToURI(referencedImageId);
                const hasImageURI = vp.hasImageURI(referencedImageURI);
                const currentImageURI = csUtils.imageIdToURI(
                  vp.getCurrentImageId()
                );
                return hasImageURI && currentImageURI !== referencedImageURI;
              });

              if (invalidatedStack) {
                delete data.cachedStats[targetId];
              }
            }
          }
        }
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      let activeHandleCanvasCoords;

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      if (
        !isAnnotationLocked(annotationUID) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0';
        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          activeHandleCanvasCoords,
          {
            color,
          }
        );
      }

      const dataId = `${annotationUID}-ellipse`;
      const ellipseUID = '0';
      drawEllipseSvg(
        svgDrawingHelper,
        annotationUID,
        ellipseUID,
        canvasCoordinates,
        {
          color,
          lineDash,
          lineWidth,
        },
        dataId
      );

      // draw center point, if "centerPointRadius" configuration is valid.
      if (centerPointRadius > 0) {
        const minRadius = Math.min(
          Math.abs(canvasCorners[0][0] - canvasCorners[1][0]) / 2, // horizontal radius
          Math.abs(canvasCorners[0][1] - canvasCorners[1][1]) / 2 // vertical radius
        );
        if (minRadius > 3 * centerPointRadius) {
          const centerPoint = this._getCanvasEllipseCenter(canvasCoordinates);
          drawCircleSvg(
            svgDrawingHelper,
            annotationUID,
            `${ellipseUID}-center`,
            centerPoint,
            centerPointRadius,
            {
              color,
              lineDash,
              lineWidth,
            }
          );
        }
      }

      renderStatus = true;

      const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
      if (!options.visibility) {
        data.handles.textBox = {
          hasMoved: false,
          worldPosition: <Types.Point3>[0, 0, 0],
          worldBoundingBox: {
            topLeft: <Types.Point3>[0, 0, 0],
            topRight: <Types.Point3>[0, 0, 0],
            bottomLeft: <Types.Point3>[0, 0, 0],
            bottomRight: <Types.Point3>[0, 0, 0],
          },
        };
        continue;
      }

      const textLines = this.configuration.getTextLines(data, targetId);
      if (!textLines || textLines.length === 0) {
        continue;
      }

      // Poor man's cached?
      let canvasTextBoxCoords;

      if (!data.handles.textBox.hasMoved) {
        canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCorners);

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords);
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      );

      const textBoxUID = '1';
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        options
      );

      const { x: left, y: top, width, height } = boundingBox;

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([left, top]),
        topRight: viewport.canvasToWorld([left + width, top]),
        bottomLeft: viewport.canvasToWorld([left, top + height]),
        bottomRight: viewport.canvasToWorld([left + width, top + height]),
      };
    }

    return renderStatus;
  };

  _calculateCachedStats = (annotation, viewport, renderingEngine) => {
    const data = annotation.data;
    const { element } = viewport;

    const { points } = data.handles;

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
    const { viewPlaneNormal, viewUp } = viewport.getCamera();

    const [topLeftCanvas, bottomRightCanvas] = <Array<Types.Point2>>(
      getCanvasEllipseCorners(canvasCoordinates)
    );

    const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
    const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);
    const { cachedStats } = data;

    const targetIds = Object.keys(cachedStats);
    const worldPos1 = topLeftWorld;
    const worldPos2 = bottomRightWorld;

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];

      const image = this.getTargetImageData(targetId);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { dimensions, imageData, metadata, voxelManager } = image;

      const pos1Index = transformWorldToIndex(imageData, worldPos1);

      pos1Index[0] = Math.floor(pos1Index[0]);
      pos1Index[1] = Math.floor(pos1Index[1]);
      pos1Index[2] = Math.floor(pos1Index[2]);

      const post2Index = transformWorldToIndex(imageData, worldPos2);

      post2Index[0] = Math.floor(post2Index[0]);
      post2Index[1] = Math.floor(post2Index[1]);
      post2Index[2] = Math.floor(post2Index[2]);

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      this.isHandleOutsideImage = !this._isInsideVolume(
        pos1Index,
        post2Index,
        dimensions
      );

      const iMin = Math.min(pos1Index[0], post2Index[0]);
      const iMax = Math.max(pos1Index[0], post2Index[0]);

      const jMin = Math.min(pos1Index[1], post2Index[1]);
      const jMax = Math.max(pos1Index[1], post2Index[1]);

      const kMin = Math.min(pos1Index[2], post2Index[2]);
      const kMax = Math.max(pos1Index[2], post2Index[2]);

      const boundsIJK = [
        [iMin, iMax],
        [jMin, jMax],
        [kMin, kMax],
      ] as [Types.Point2, Types.Point2, Types.Point2];

      const center = [
        (topLeftWorld[0] + bottomRightWorld[0]) / 2,
        (topLeftWorld[1] + bottomRightWorld[1]) / 2,
        (topLeftWorld[2] + bottomRightWorld[2]) / 2,
      ] as Types.Point3;

      const ellipseObj = {
        center,
        xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
        yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
        zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
      };

      const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
        viewPlaneNormal,
        viewUp,
        worldPos1,
        worldPos2
      );
      const isEmptyArea = worldWidth === 0 && worldHeight === 0;

      const handles = [pos1Index, post2Index];
      const { scale, areaUnit } = getCalibratedLengthUnitsAndScale(
        image,
        handles
      );

      const area =
        Math.abs(Math.PI * (worldWidth / 2) * (worldHeight / 2)) /
        scale /
        scale;

      const pixelUnitsOptions = {
        isPreScaled: isViewportPreScaled(viewport, targetId),

        isSuvScaled: this.isSuvScaled(
          viewport,
          targetId,
          annotation.metadata.referencedImageId
        ),
      };

      const modalityUnit = getPixelValueUnits(
        metadata.Modality,
        annotation.metadata.referencedImageId,
        pixelUnitsOptions
      );

      const pointsInShape = voxelManager.forEach(
        this.configuration.statsCalculator.statsCallback,
        {
          boundsIJK,
          imageData,
          isInObject: (pointLPS) =>
            pointInEllipse(ellipseObj, pointLPS, { fast: true }),
          returnPoints: this.configuration.storePointData,
        }
      );

      const stats = this.configuration.statsCalculator.getStatistics();
      cachedStats[targetId] = {
        Modality: metadata.Modality,
        area,
        mean: stats.mean?.value,
        max: stats.max?.value,
        stdDev: stats.stdDev?.value,
        statsArray: stats.array,
        pointsInShape,
        isEmptyArea,
        areaUnit,
        modalityUnit,
      };
    }

    annotation.invalidated = false;

    // Dispatching annotation modified
    triggerAnnotationModified(annotation, element, ChangeTypes.StatsUpdated);

    return cachedStats;
  };

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    );
  };

  /**
   * This is a temporary function to use the old ellipse's canvas-based
   * calculation for isPointNearTool, we should move the the world-based
   * calculation to the tool's isPointNearTool function.
   *
   * @param ellipse - The ellipse object
   * @param location - The location to check
   * @returns True if the point is inside the ellipse
   */
  _pointInEllipseCanvas(ellipse, location: Types.Point2): boolean {
    const xRadius = ellipse.width / 2;
    const yRadius = ellipse.height / 2;

    if (xRadius <= 0.0 || yRadius <= 0.0) {
      return false;
    }

    const center = [ellipse.left + xRadius, ellipse.top + yRadius];
    const normalized = [location[0] - center[0], location[1] - center[1]];

    const inEllipse =
      (normalized[0] * normalized[0]) / (xRadius * xRadius) +
        (normalized[1] * normalized[1]) / (yRadius * yRadius) <=
      1.0;

    return inEllipse;
  }

  /**
   * It takes the canvas coordinates of the ellipse corners and returns the center point of it
   *
   * @param ellipseCanvasPoints - The coordinates of the ellipse in the canvas.
   * @returns center point.
   */
  _getCanvasEllipseCenter(ellipseCanvasPoints: Types.Point2[]): Types.Point2 {
    const [bottom, top, left, right] = ellipseCanvasPoints;
    const topLeft = [left[0], top[1]];
    const bottomRight = [right[0], bottom[1]];
    return [
      (topLeft[0] + bottomRight[0]) / 2,
      (topLeft[1] + bottomRight[1]) / 2,
    ] as Types.Point2;
  }
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { area, mean, stdDev, max, isEmptyArea, areaUnit, modalityUnit } =
    cachedVolumeStats;

  const textLines: string[] = [];

  if (area) {
    const areaLine = isEmptyArea
      ? `Area: Oblique not supported`
      : `Area: ${csUtils.roundNumber(area)} ${areaUnit}`;
    textLines.push(areaLine);
  }

  if (mean) {
    textLines.push(`Mean: ${csUtils.roundNumber(mean)} ${modalityUnit}`);
  }

  if (max) {
    textLines.push(`Max: ${csUtils.roundNumber(max)} ${modalityUnit}`);
  }

  if (stdDev) {
    textLines.push(`Std Dev: ${csUtils.roundNumber(stdDev)} ${modalityUnit}`);
  }

  return textLines;
}

export default EllipticalROITool;
