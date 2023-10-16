import {
  CONSTANTS,
  getEnabledElement,
  triggerEvent,
  eventTarget,
  StackViewport,
  VolumeViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import {
  getCalibratedAreaUnits,
  getCalibratedScale,
} from '../../utilities/getCalibratedUnits';
import roundNumber from '../../utilities/roundNumber';
import { Events } from '../../enums';
import { AnnotationTool } from '../base';
import {
  addAnnotation,
  getAnnotations,
} from '../../stateManagement/annotation/annotationState';
import { polyline } from '../../utilities/math';
import { filterAnnotationsForDisplay } from '../../utilities/planar';
import throttle from '../../utilities/throttle';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import registerDrawLoop from './planarFreehandROITool/drawLoop';
import registerEditLoopCommon from './planarFreehandROITool/editLoopCommon';
import registerClosedContourEditLoop from './planarFreehandROITool/closedContourEditLoop';
import registerOpenContourEditLoop from './planarFreehandROITool/openContourEditLoop';
import registerOpenContourEndEditLoop from './planarFreehandROITool/openContourEndEditLoop';
import registerRenderMethods from './planarFreehandROITool/renderMethods';
import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
} from '../../types/EventTypes';
import {
  EventTypes,
  ToolHandle,
  Annotation,
  Annotations,
  AnnotationStyle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import { drawLinkedTextBox } from '../../drawingSvg';
import { PlanarFreehandROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import { PlanarFreehandROICommonData } from '../../utilities/math/polyline/planarFreehandROIInternalTypes';

import { getIntersectionCoordinatesWithPolyline } from '../../utilities/math/polyline/getIntersectionWithPolyline';
import pointInShapeCallback from '../../utilities/pointInShapeCallback';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';
import {
  ModalityUnitOptions,
  getModalityUnit,
} from '../../utilities/getModalityUnit';
import { BasicStatsCalculator } from '../../utilities/math/basic';

const { pointCanProjectOnLine } = polyline;
const { EPSILON } = CONSTANTS;

const PARALLEL_THRESHOLD = 1 - EPSILON;
/**
 * PlanarFreehandROITool lets you draw annotations that define an arbitrarily drawn region.
 * You can use the PlanarFreehandROITool in all perpendicular views (axial, sagittal, coronal),
 * support for oblique views is possible, but not yet supported, due to the implementation of
 * `getSubPixelSpacingAndXYDirections`.
 *
 * The resulting annotation's data and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * PlanarFreehandROITool annotation can be smoothed on drawing completion. This is a configured based approach.
 * The interpolation process uses b-spline algorithm and consider 4 configurations properties:
 * - interpolation.interpolateOnAdd: to tell whether it should be interpolated or not (for editing it is considered the property interpolateOnEdit) (default: false)
 * - interpolation.interpolateOnEdit: to tell whether it should be interpolated or not when editing (default: false)
 * - interpolation.knotsRatioPercentageOnAdd: percentage of points from Segment that are likely to be considered knots during interpolation (for editing it is considered the property knotsRatioPercentageOnEdit) ( default: 40)
 * - interpolation.knotsRatioPercentageOnEdit: same as knotsRatioPercentageOnAdd but applicable only when editing the tool (default: 40)
 *
 * So, with that said the interpolation might occur when:
 * - drawing is done (i.e mouse is released) and interpolation.interpolateOnAdd is true. Interpolation algorithm uses knotsRatioPercentageOnAdd
 * - edit drawing is done (i.e mouse is released) and interpolation.interpolateOnEdit is true. Interpolation algorithm uses knotsRatioPercentageOnEdit and its only applied to changed segment
 * Interpolation does not occur when:
 * - interpolation.interpolateOnAdd is false and drawing is completed
 * - interpolation.interpolateOnEdit is false and edit is completed
 * - drawing still happening (editing or not)
 *
 * The result of interpolation will be a smoother set of segments.
 * Changing tool configuration (see below) you can fine-tune the interpolation process by changing knotsRatioPercentageOnAdd and knotsRatioPercentageOnEdit value, which smaller values produces a more agressive interpolation.
 * A smaller value of knotsRatioPercentageOnAdd/knotsRatioPercentageOnEdit produces a more agressive interpolation.
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
 *
 * // set interpolation agressiveness while adding new annotation (ps: this does not change if interpolation is ON or OFF)
 * toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
 *   interpolation: { knotsRatioPercentageOnAdd: 30 },
 * });
 *
 * // set interpolation to be ON while editing only
 * toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
 *   interpolation: { interpolateOnAdd: false, interpolateOnEdit: true  },
 * });
 * ```
 *
 * Read more in the Docs section of the website.
 */

class PlanarFreehandROITool extends AnnotationTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  private commonData?: PlanarFreehandROICommonData;
  isDrawing = false;
  isEditingClosed = false;
  isEditingOpen = false;

  private activateDraw: (
    evt: EventTypes.InteractionEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateClosedContourEdit: (
    evt: EventTypes.InteractionEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateOpenContourEdit: (
    evt: EventTypes.InteractionEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[]
  ) => void;
  private activateOpenContourEndEdit: (
    evt: EventTypes.InteractionEventType,
    annotation: PlanarFreehandROIAnnotation,
    viewportIdsToRender: string[],
    handle: ToolHandle | null
  ) => void;
  private cancelDrawing: (element: HTMLDivElement) => void;
  private cancelClosedContourEdit: (element: HTMLDivElement) => void;
  private cancelOpenContourEdit: (element: HTMLDivElement) => void;

  private renderContour: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper,
    annotation: PlanarFreehandROIAnnotation
  ) => void;
  private renderContourBeingDrawn: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper,
    annotation: PlanarFreehandROIAnnotation
  ) => void;
  private renderClosedContourBeingEdited: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper,
    annotation: PlanarFreehandROIAnnotation
  ) => void;
  private renderOpenContourBeingEdited: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper,
    annotation: PlanarFreehandROIAnnotation
  ) => void;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        alwaysRenderOpenContourHandles: {
          // When true, always render end points when you have an open contour, rather
          // than just rendering a line.
          enabled: false,
          // When enabled, use this radius to draw the endpoints whilst not hovering.
          radius: 2,
        },
        allowOpenContours: true,
        // Proximity in canvas coordinates used to join contours.
        closeContourProximity: 10,
        // The proximity at which we fallback to the simplest grabbing logic for
        // determining what index of the contour to start editing.
        checkCanvasEditFallbackProximity: 6,
        // The relative distance that points should be dropped along the polyline
        // in units of the image pixel spacing. A value of 1 means that nodes must
        // be placed no closed than the image spacing apart. A value of 4 means that 4
        // nodes should be placed within the space of one image pixel size. A higher
        // value gives more finese to the tool/smoother lines, but the value cannot
        // be infinite as the lines become very computationally expensive to draw.
        subPixelResolution: 4,
        interpolation: {
          interpolateOnAdd: false,
          interpolateOnEdit: false, // used for edit only
          knotsRatioPercentageOnAdd: 40,
          knotsRatioPercentageOnEdit: 40,
        },
        calculateStats: false,
        getTextLines: defaultGetTextLines,
        statsCalculator: BasicStatsCalculator,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    // Register event loops and rendering logic, which are stored in different
    // Files due to their complexity/size.
    registerDrawLoop(this);
    registerEditLoopCommon(this);
    registerClosedContourEditLoop(this);
    registerOpenContourEditLoop(this);
    registerOpenContourEndEditLoop(this);
    registerRenderMethods(this);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  /**
   * Based on the current position of the mouse and the current image, creates
   * a `PlanarFreehandROIAnnotation` and stores it in the annotationManager.
   *
   * @param evt - `EventTypes.NormalizedMouseEventType`
   * @returns The `PlanarFreehandROIAnnotation` object.
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): PlanarFreehandROIAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation: PlanarFreehandROIAnnotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
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

    addAnnotation(annotation, element);

    this.activateDraw(evt, annotation, viewportIdsToRender);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * Begins an edit of an open contour, when the mouse has selected a handle
   * (end) of the open contour.
   *
   * @param evt - `EventTypes.MouseDownEventType`
   * @param annotation - `PlanarFreehandROIAnnotation` annotation.
   * @param handle - The handle index, 0 for the start and 1 for the end.
   * @param interactionType - interaction type (mouse, touch)
   */
  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: PlanarFreehandROIAnnotation,
    handle: ToolHandle
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.activateOpenContourEndEdit(
      evt,
      annotation,
      viewportIdsToRender,
      handle
    );
  };

  /**
   * Edits the open or closed contour when the line is grabbed and dragged.
   */
  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: PlanarFreehandROIAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    if (annotation.data.isOpenContour) {
      this.activateOpenContourEdit(evt, annotation, viewportIdsToRender);
    } else {
      this.activateClosedContourEdit(evt, annotation, viewportIdsToRender);
    }
  };

  /**
   * Returns if the canvas point is near the line of the given annotation in the
   * provided element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - The `PlanarFreehandROIAnnotation`.
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: PlanarFreehandROIAnnotation,
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

      const distance = pointCanProjectOnLine(canvasCoords, p1, p2, proximity);

      if (distance === true) {
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

    const distance = pointCanProjectOnLine(
      canvasCoords,
      pStart,
      pEnd,
      proximity
    );

    if (distance === true) {
      return true;
    }

    return false;
  };

  cancel = (element: HTMLDivElement): void => {
    const isDrawing = this.isDrawing;
    const isEditingOpen = this.isEditingOpen;
    const isEditingClosed = this.isEditingClosed;

    if (isDrawing) {
      this.cancelDrawing(element);
    } else if (isEditingOpen) {
      this.cancelOpenContourEdit(element);
    } else if (isEditingClosed) {
      this.cancelClosedContourEdit(element);
    }
  };

  /**
   * Triggers an annotation modified event.
   */
  triggerAnnotationModified = (
    annotation: PlanarFreehandROIAnnotation,
    enabledElement: Types.IEnabledElement
  ): void => {
    const { viewportId, renderingEngineId } = enabledElement;
    // Dispatching annotation modified
    const eventType = Events.ANNOTATION_MODIFIED;

    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
    };
    triggerEvent(eventTarget, eventType, eventDetail);
  };

  /**
   * Triggers an annotation completed event.
   */
  triggerAnnotationCompleted = (
    annotation: PlanarFreehandROIAnnotation
  ): void => {
    const eventType = Events.ANNOTATION_COMPLETED;

    const eventDetail: AnnotationCompletedEventDetail = {
      annotation,
    };

    triggerEvent(eventTarget, eventType, eventDetail);
  };

  /**
   * @override We need to override this method as the tool doesn't always have
   * `handles`, which means `filterAnnotationsForDisplay` fails inside
   * `filterAnnotationsWithinSlice`.
   */
  filterInteractableAnnotationsForElement(
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations | undefined {
    if (!annotations || !annotations.length) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    let annotationsToDisplay;

    if (viewport instanceof StackViewport) {
      // Use the default `filterAnnotationsForDisplay` utility, as the stack
      // path doesn't require handles.
      annotationsToDisplay = filterAnnotationsForDisplay(viewport, annotations);
    } else if (viewport instanceof VolumeViewport) {
      const camera = viewport.getCamera();

      const { spacingInNormalDirection } =
        csUtils.getTargetVolumeAndSpacingInNormalDir(viewport, camera);

      // Get data with same normal and within the same slice
      annotationsToDisplay = this.filterAnnotationsWithinSlice(
        annotations,
        camera,
        spacingInNormalDirection
      );
    } else {
      throw new Error(`Viewport Type ${viewport.type} not supported`);
    }

    return annotationsToDisplay;
  }

  /**
   * Altered version of the `utilities.planar.filterAnnotationsWithinSlice`,
   * which uses the polyline position rather than the handle. As the polyline is
   * always present.
   */
  private filterAnnotationsWithinSlice(
    annotations: Annotations,
    camera: Types.ICamera,
    spacingInNormalDirection: number
  ): Annotations {
    const { viewPlaneNormal } = camera;

    const annotationsWithParallelNormals = annotations.filter(
      (td: Annotation) => {
        const annotationViewPlaneNormal = td.metadata.viewPlaneNormal;

        const isParallel =
          Math.abs(vec3.dot(viewPlaneNormal, annotationViewPlaneNormal)) >
          PARALLEL_THRESHOLD;

        return annotationViewPlaneNormal && isParallel;
      }
    );

    // No in plane annotations.
    if (!annotationsWithParallelNormals.length) {
      return [];
    }

    // Annotation should be within the slice, which means that it should be between
    // camera's focalPoint +/- spacingInNormalDirection.

    const halfSpacingInNormalDirection = spacingInNormalDirection / 2;
    const { focalPoint } = camera;

    const annotationsWithinSlice = [];

    for (const annotation of annotationsWithParallelNormals) {
      const data = annotation.data;
      const point = data.polyline[0];

      if (!annotation.isVisible) {
        continue;
      }

      // A = point
      // B = focal point
      // P = normal

      // B-A dot P  => Distance in the view direction.
      // this should be less than half the slice distance.

      const dir = vec3.create();

      vec3.sub(dir, focalPoint, point);

      const dot = vec3.dot(dir, viewPlaneNormal);

      if (Math.abs(dot) < halfSpacingInNormalDirection) {
        annotationsWithinSlice.push(annotation);
      }
    }

    return annotationsWithinSlice;
  }

  /**
   * Draws the `PlanarFreehandROIAnnotation`s at each request animation frame.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport, renderingEngine } = enabledElement;
    const { element } = viewport;

    const targetId = this.getTargetId(viewport);

    let annotations = <PlanarFreehandROIAnnotation[]>(
      getAnnotations(this.getToolName(), element)
    );

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    ) as PlanarFreehandROIAnnotation[];

    if (!annotations?.length) {
      return renderStatus;
    }

    const isDrawing = this.isDrawing;
    const isEditingOpen = this.isEditingOpen;
    const isEditingClosed = this.isEditingClosed;

    if (!(isDrawing || isEditingOpen || isEditingClosed)) {
      // No annotations are currently being modified, so we can just use the
      // render contour method to render all of them
      annotations.forEach((annotation) => {
        this.renderContour(enabledElement, svgDrawingHelper, annotation);
      });
    } else {
      // One of the annotations will need special rendering treatment, render all
      // other annotations not being interacted with using the standard renderContour
      // rendering path.
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

      // Todo: return boolean flag for each rendering route in the planar tool.
      renderStatus = true;
    }

    if (!this.configuration.calculateStats) {
      return;
    }

    annotations.forEach((annotation) => {
      const activeAnnotationUID = this.commonData?.annotation.annotationUID;
      if (
        annotation.annotationUID === activeAnnotationUID &&
        !this.commonData?.movingTextBox
      ) {
        return;
      }

      if (!this.commonData?.movingTextBox) {
        const { data } = annotation;
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

          this._calculateCachedStats(
            annotation,
            viewport,
            renderingEngine,
            enabledElement
          );
        } else if (annotation.invalidated) {
          this._throttledCalculateCachedStats(
            annotation,
            viewport,
            renderingEngine,
            enabledElement
          );
        }
      }

      this._renderStats(annotation, viewport, enabledElement, svgDrawingHelper);
    });

    return renderStatus;
  };

  _calculateCachedStats = (
    annotation,
    viewport,
    renderingEngine,
    enabledElement
  ) => {
    const data = annotation.data;
    const { cachedStats, polyline: points } = data;

    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];
      const image = this.getTargetIdImage(targetId, renderingEngine);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { imageData, metadata } = image;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      // Using an arbitrary start point (canvasPoint), calculate the
      // mm spacing for the canvas in the X and Y directions.
      const canvasPoint = canvasCoordinates[0];
      const originalWorldPoint = viewport.canvasToWorld(canvasPoint);
      const deltaXPoint = viewport.canvasToWorld([
        canvasPoint[0] + 1,
        canvasPoint[1],
      ]);
      const deltaYPoint = viewport.canvasToWorld([
        canvasPoint[0],
        canvasPoint[1] + 1,
      ]);

      const deltaInX = vec3.distance(originalWorldPoint, deltaXPoint);
      const deltaInY = vec3.distance(originalWorldPoint, deltaYPoint);

      const scale = getCalibratedScale(image);
      let area =
        polyline.calculateAreaOfPoints(canvasCoordinates) / scale / scale;
      // Convert from canvas_pixels ^2 to mm^2
      area *= deltaInX * deltaInY;

      const worldPosIndex = csUtils.transformWorldToIndex(imageData, points[0]);
      worldPosIndex[0] = Math.floor(worldPosIndex[0]);
      worldPosIndex[1] = Math.floor(worldPosIndex[1]);
      worldPosIndex[2] = Math.floor(worldPosIndex[2]);

      let iMin = worldPosIndex[0];
      let iMax = worldPosIndex[0];

      let jMin = worldPosIndex[1];
      let jMax = worldPosIndex[1];

      let kMin = worldPosIndex[2];
      let kMax = worldPosIndex[2];

      for (let j = 1; j < points.length; j++) {
        const worldPosIndex = csUtils.transformWorldToIndex(
          imageData,
          points[j]
        );
        worldPosIndex[0] = Math.floor(worldPosIndex[0]);
        worldPosIndex[1] = Math.floor(worldPosIndex[1]);
        worldPosIndex[2] = Math.floor(worldPosIndex[2]);
        iMin = Math.min(iMin, worldPosIndex[0]);
        iMax = Math.max(iMax, worldPosIndex[0]);

        jMin = Math.min(jMin, worldPosIndex[1]);
        jMax = Math.max(jMax, worldPosIndex[1]);

        kMin = Math.min(kMin, worldPosIndex[2]);
        kMax = Math.max(kMax, worldPosIndex[2]);
      }

      // Expand bounding box
      const iDelta = 0.01 * (iMax - iMin);
      const jDelta = 0.01 * (jMax - jMin);
      const kDelta = 0.01 * (kMax - kMin);

      iMin = Math.floor(iMin - iDelta);
      iMax = Math.ceil(iMax + iDelta);
      jMin = Math.floor(jMin - jDelta);
      jMax = Math.ceil(jMax + jDelta);
      kMin = Math.floor(kMin - kDelta);
      kMax = Math.ceil(kMax + kDelta);

      const boundsIJK = [
        [iMin, iMax],
        [jMin, jMax],
        [kMin, kMax],
      ] as [Types.Point2, Types.Point2, Types.Point2];

      const worldPosEnd = imageData.indexToWorld([iMax, jMax, kMax]);
      const canvasPosEnd = viewport.worldToCanvas(worldPosEnd);

      let curRow = 0;
      let intersections = [];
      let intersectionCounter = 0;
      const pointsInShape = pointInShapeCallback(
        imageData,
        (pointLPS, pointIJK) => {
          let result = true;
          const point = viewport.worldToCanvas(pointLPS);
          if (point[1] != curRow) {
            intersectionCounter = 0;
            curRow = point[1];
            intersections = getIntersectionCoordinatesWithPolyline(
              canvasCoordinates,
              point,
              [canvasPosEnd[0], point[1]]
            );
            intersections.sort(
              (function (index) {
                return function (a, b) {
                  return a[index] === b[index]
                    ? 0
                    : a[index] < b[index]
                    ? -1
                    : 1;
                };
              })(0)
            );
          }
          if (intersections.length && point[0] > intersections[0][0]) {
            intersections.shift();
            intersectionCounter++;
          }
          if (intersectionCounter % 2 === 0) {
            result = false;
          }
          return result;
        },
        this.configuration.statsCalculator.statsCallback,
        boundsIJK
      );

      const modalityUnitOptions = {
        isPreScaled: isViewportPreScaled(viewport, targetId),
        isSuvScaled: this.isSuvScaled(
          viewport,
          targetId,
          annotation.metadata.referencedImageId
        ),
      };

      const modalityUnit = getModalityUnit(
        metadata.Modality,
        annotation.metadata.referencedImageId,
        modalityUnitOptions
      );

      const stats = this.configuration.statsCalculator.getStatistics();

      cachedStats[targetId] = {
        Modality: metadata.Modality,
        area,
        mean: stats[1]?.value,
        max: stats[0]?.value,
        stdDev: stats[3]?.value,
        statsArray: stats,
        pointsInShape: pointsInShape,
        areaUnit: getCalibratedAreaUnits(null, image),
        modalityUnit,
      };
    }

    this.triggerAnnotationModified(annotation, enabledElement);

    annotation.invalidated = false;

    return cachedStats;
  };

  _renderStats = (annotation, viewport, enabledElement, svgDrawingHelper) => {
    const data = annotation.data;
    const targetId = this.getTargetId(viewport);

    const styleSpecifier: AnnotationStyle.StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
    if (!options.visibility) {
      return;
    }

    const textLines = this.configuration.getTextLines(data, targetId);
    if (!textLines || textLines.length === 0) {
      return;
    }

    const canvasCoordinates = data.polyline.map((p) =>
      viewport.worldToCanvas(p)
    );
    if (!data.handles.textBox.hasMoved) {
      const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

      data.handles.textBox.worldPosition =
        viewport.canvasToWorld(canvasTextBoxCoords);
    }

    const textBoxPosition = viewport.worldToCanvas(
      data.handles.textBox.worldPosition
    );

    const textBoxUID = '1';
    const boundingBox = drawLinkedTextBox(
      svgDrawingHelper,
      annotation.annotationUID ?? '',
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
  };
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { area, mean, stdDev, max, isEmptyArea, areaUnit, modalityUnit } =
    cachedVolumeStats;

  const textLines: string[] = [];

  if (area) {
    const areaLine = isEmptyArea
      ? `Area: Oblique not supported`
      : `Area: ${roundNumber(area)} ${areaUnit}`;
    textLines.push(areaLine);
  }

  if (mean) {
    textLines.push(`Mean: ${roundNumber(mean)} ${modalityUnit}`);
  }

  if (max) {
    textLines.push(`Max: ${roundNumber(max)} ${modalityUnit}`);
  }

  if (stdDev) {
    textLines.push(`Std Dev: ${roundNumber(stdDev)} ${modalityUnit}`);
  }

  return textLines;
}

PlanarFreehandROITool.toolName = 'PlanarFreehandROI';
export default PlanarFreehandROITool;
