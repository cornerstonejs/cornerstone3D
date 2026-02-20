import {
  CONSTANTS,
  getEnabledElement,
  VolumeViewport,
  utilities as csUtils,
  metaData,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import { getCalibratedLengthUnitsAndScale } from '../../utilities/getCalibratedUnits';
import * as math from '../../utilities/math';
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
import type {
  EventTypes,
  ToolHandle,
  Annotation,
  Annotations,
  AnnotationStyle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  AnnotationRenderContext,
  Statistics,
} from '../../types';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';
import type {
  ContourAnnotation,
  PlanarFreehandROIAnnotation,
} from '../../types/ToolSpecificAnnotationTypes';
import type { PlanarFreehandROICommonData } from '../../utilities/math/polyline/planarFreehandROIInternalTypes';

import { getLineSegmentIntersectionsCoordinates } from '../../utilities/math/polyline';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';
import { BasicStatsCalculator } from '../../utilities/math/basic';
import ContourSegmentationBaseTool from '../base/ContourSegmentationBaseTool';
import { KeyboardBindings, ChangeTypes, MeasurementType } from '../../enums';
import { getPixelValueUnits } from '../../utilities/getPixelValueUnits';

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
 * The smoothing process uses b-spline algorithm and consider 4 configurations properties:
 * - smoothing.smoothOnAdd: to tell whether it should be smoothed or not (for editing it is considered the property smoothOnEdit) (default: false)
 * - smoothing.smoothOnEdit: to tell whether it should be smoothed or not when editing (default: false)
 * - smoothing.knotsRatioPercentageOnAdd: percentage of points from Segment that are likely to be considered knots during smoothing (for editing it is considered the property knotsRatioPercentageOnEdit) ( default: 40)
 * - smoothing.knotsRatioPercentageOnEdit: same as knotsRatioPercentageOnAdd but applicable only when editing the tool (default: 40)
 *
 * So, with that said the smoothing might occur when:
 * - drawing is done (i.e mouse is released) and smoothing.smoothOnAdd is true. smoothing algorithm uses knotsRatioPercentageOnAdd
 * - edit drawing is done (i.e mouse is released) and smoothing.smoothOnEdit is true. smoothing algorithm uses knotsRatioPercentageOnEdit and its only applied to changed segment
 * smoothing does not occur when:
 * - smoothing.smoothOnAdd is false and drawing is completed
 * - smoothing.smoothOnEdit is false and edit is completed
 * - drawing still happening (editing or not)
 *
 * The result of smoothing will be removal of some of the outliers
 * Changing tool configuration (see below) you can fine-tune the smoothing process by changing knotsRatioPercentageOnAdd and knotsRatioPercentageOnEdit value, which smaller values produces a more agressive smoothing.
 * A smaller value of knotsRatioPercentageOnAdd/knotsRatioPercentageOnEdit produces a more aggressive smoothing.
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
 * // set smoothing aggressiveness while adding new annotation (ps: this does not change if smoothing is ON or OFF)
 * toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
 *   smoothing: { knotsRatioPercentageOnAdd: 30 },
 * });
 *
 * // set smoothing to be ON while editing only
 * toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
 *   smoothing: { smoothOnAdd: false, smoothOnEdit: true  },
 * });
 * ```
 *
 *
 * Read more in the Docs section of the website.
 */

class PlanarFreehandROITool extends ContourSegmentationBaseTool {
  static toolName = 'PlanarFreehandROI';

  _throttledCalculateCachedStats: Function;
  private commonData?: PlanarFreehandROICommonData;
  isDrawing = false;
  isEditingClosed = false;
  isEditingOpen = false;

  protected activateDraw: (
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

  private renderPointContourWithMarker: (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper,
    annotation: PlanarFreehandROIAnnotation
  ) => void;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        // Whether to store point data in the annotation
        storePointData: false,
        shadow: true,
        preventHandleOutsideImage: false,
        /**
         * Specify which modifier key is used to add a hole to a contour. The
         * modifier must be pressed when the first point of a new contour is added.
         */
        contourHoleAdditionModifierKey: KeyboardBindings.Shift,
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
        // For closed contours, make them clockwise
        // This can be useful if contours are compared between slices, eg for
        // interpolation, and does not cause problems otherwise so defaulting to true.
        makeClockWise: true,
        // The relative distance that points should be dropped along the polyline
        // in units of the image pixel spacing. A value of 1 means that nodes must
        // be placed no closed than the image spacing apart. A value of 4 means that 4
        // nodes should be placed within the space of one image pixel size. A higher
        // value gives more finesse to the tool/smoother lines, but the value cannot
        // be infinite as the lines become very computationally expensive to draw.
        subPixelResolution: 4,
        /**
         * Smoothing is used to remove jagged irregularities in the polyline,
         * as opposed to interpolation, which is used to create new polylines
         * between existing polylines.
         */
        smoothing: {
          smoothOnAdd: false,
          smoothOnEdit: false, // used for edit only
          knotsRatioPercentageOnAdd: 40,
          knotsRatioPercentageOnEdit: 40,
        },
        /**
         * Interpolation is the creation of new segmentations in between the
         * existing segmentations/indices.  Note that this does not apply to
         * ROI values, since those annotations are individual annotations, not
         * connected in any way to each other, whereas segmentations are intended
         * to be connected 2d + 1 dimension (time or space or other) volumes.
         */
        interpolation: {
          enabled: false,
          // Callback to update the annotation or perform other action when the
          // interpolation is complete.
          onInterpolationComplete: null,
        },
        /**
         * The polyline may get processed in order to reduce the number of points
         * for better performance and storage.
         */
        decimate: {
          enabled: false,
          /** A maximum given distance 'epsilon' to decide if a point should or
           * shouldn't be added the resulting polyline which will have a lower
           * number of points for higher `epsilon` values.
           */
          epsilon: 0.1,
        },
        displayOnePointAsCrosshairs: false,
        calculateStats: true,
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
    const { element } = eventDetail;

    const annotation = this.createAnnotation(
      evt
    ) as PlanarFreehandROIAnnotation;

    this.addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.activateDraw(evt, annotation, viewportIdsToRender);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

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

    if (annotation.data.contour.closed) {
      this.activateClosedContourEdit(evt, annotation, viewportIdsToRender);
    } else {
      this.activateOpenContourEdit(evt, annotation, viewportIdsToRender);
    }

    evt.preventDefault();
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

    const { polyline: points } = annotation.data.contour;

    // NOTE: It is implemented this way so that we do not double calculate
    // points when number crunching adjacent line segments.
    let previousPoint = viewport.worldToCanvas(points[0]);

    for (let i = 1; i < points.length; i++) {
      const p1 = previousPoint;
      const p2 = viewport.worldToCanvas(points[i]);
      const canProject = pointCanProjectOnLine(canvasCoords, p1, p2, proximity);

      if (canProject) {
        return true;
      }

      previousPoint = p2;
    }

    if (!annotation.data.contour.closed) {
      // Contour is open, don't check last point to first point.
      return false;
    }

    // check last point to first point
    const pStart = viewport.worldToCanvas(points[0]);
    const pEnd = viewport.worldToCanvas(points[points.length - 1]);

    return pointCanProjectOnLine(canvasCoords, pStart, pEnd, proximity);
  };

  public cancel = (element: HTMLDivElement): void => {
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
   * @override We need to override this method as the tool doesn't always have
   * `handles`, which means `filterAnnotationsForDisplay` fails inside
   * `filterAnnotationsWithinSlice`.
   */
  public filterInteractableAnnotationsForElement(
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations | undefined {
    if (!annotations?.length) {
      return [];
    }

    const baseFilteredAnnotations =
      super.filterInteractableAnnotationsForElement(element, annotations);
    if (!baseFilteredAnnotations?.length) {
      return [];
    }

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    let annotationsToDisplay;

    if (viewport instanceof VolumeViewport) {
      const camera = viewport.getCamera();

      const { spacingInNormalDirection } =
        csUtils.getTargetVolumeAndSpacingInNormalDir(viewport, camera);

      // Get data with same normal and within the same slice
      annotationsToDisplay = this.filterAnnotationsWithinSlice(
        baseFilteredAnnotations,
        camera,
        spacingInNormalDirection
      );
    } else {
      // Use the default `filterAnnotationsForDisplay` utility, as the stack
      // path doesn't require handles.
      annotationsToDisplay = filterAnnotationsForDisplay(viewport, annotations);
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
        let annotationViewPlaneNormal = td.metadata.viewPlaneNormal;

        if (
          !td.metadata.referencedImageId &&
          !annotationViewPlaneNormal &&
          td.metadata.FrameOfReferenceUID
        ) {
          for (const point of td.data.contour.polyline) {
            const vector = vec3.sub(vec3.create(), point, camera.focalPoint);
            const dotProduct = vec3.dot(vector, camera.viewPlaneNormal);
            if (!csUtils.isEqual(dotProduct, 0)) {
              return false;
            }
          }
          td.metadata.viewPlaneNormal = camera.viewPlaneNormal;
          td.metadata.cameraFocalPoint = camera.focalPoint;
          return true;
        }

        if (!annotationViewPlaneNormal) {
          // This code is run to set the annotation view plane normal
          // for historical data which was saved without the normal.
          const { referencedImageId } = td.metadata;
          const { imageOrientationPatient } = metaData.get(
            'imagePlaneModule',
            referencedImageId
          );
          const rowCosineVec = vec3.fromValues(
            imageOrientationPatient[0],
            imageOrientationPatient[1],
            imageOrientationPatient[2]
          );

          const colCosineVec = vec3.fromValues(
            imageOrientationPatient[3],
            imageOrientationPatient[4],
            imageOrientationPatient[5]
          );

          annotationViewPlaneNormal = vec3.create() as Types.Point3;

          vec3.cross(annotationViewPlaneNormal, rowCosineVec, colCosineVec);
          td.metadata.viewPlaneNormal = annotationViewPlaneNormal;
        }

        const isParallel =
          Math.abs(vec3.dot(viewPlaneNormal, annotationViewPlaneNormal)) >
          PARALLEL_THRESHOLD;

        return annotationViewPlaneNormal && isParallel;
      }
    ) as PlanarFreehandROIAnnotation[];

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
      const point = data.contour.polyline[0];

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

  protected isContourSegmentationTool(): boolean {
    // Disable contour segmentation behavior because it shall be activated only
    // for PlanarFreehandContourSegmentationTool
    return false;
  }

  protected createAnnotation(
    evt: EventTypes.InteractionEventType
  ): ContourAnnotation {
    const worldPos = evt.detail.currentPoints.world;
    const contourAnnotation = super.createAnnotation(evt);

    const onInterpolationComplete = (annotation) => {
      // Clear out the handles because they aren't used for straight freeform
      annotation.data.handles.points.length = 0;
    };

    const annotation = <PlanarFreehandROIAnnotation>csUtils.deepMerge(
      contourAnnotation,
      {
        data: {
          contour: {
            polyline: [<Types.Point3>[...worldPos]],
          },
          label: '',
          cachedStats: {},
        },
        onInterpolationComplete,
      }
    );

    return annotation;
  }

  protected getAnnotationStyle(context) {
    // This method exists only because `super` cannot be called from
    // _getRenderingOptions() which is in an external file.
    return super.getAnnotationStyle(context);
  }

  protected renderAnnotationInstance(
    renderContext: AnnotationRenderContext
  ): boolean {
    const { enabledElement, targetId, svgDrawingHelper } = renderContext;
    const annotation = renderContext.annotation as PlanarFreehandROIAnnotation;

    let renderStatus = false;
    const { viewport, renderingEngine } = enabledElement;

    const isDrawing = this.isDrawing;
    const isEditingOpen = this.isEditingOpen;
    const isEditingClosed = this.isEditingClosed;

    if (!(isDrawing || isEditingOpen || isEditingClosed)) {
      // No annotations are currently being modified, so we can just use the
      // render contour method to render all of them
      if (
        this.configuration.displayOnePointAsCrosshairs &&
        annotation.data.contour.polyline.length === 1
      ) {
        this.renderPointContourWithMarker(
          enabledElement,
          svgDrawingHelper,
          annotation
        );
      } else {
        this.renderContour(enabledElement, svgDrawingHelper, annotation);
      }
    } else {
      // The active annotation will need special rendering treatment. Render all
      // other annotations not being interacted with using the standard renderContour
      // rendering path.
      const activeAnnotationUID = this.commonData.annotation.annotationUID;

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
        if (
          this.configuration.displayOnePointAsCrosshairs &&
          annotation.data.contour.polyline.length === 1
        ) {
          this.renderPointContourWithMarker(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else {
          this.renderContour(enabledElement, svgDrawingHelper, annotation);
        }
      }

      // Todo: return boolean flag for each rendering route in the planar tool.
      renderStatus = true;
    }

    if (!this.configuration.calculateStats) {
      return;
    }

    if (annotation.invalidated) {
      this._calculateStatsIfActive(
        annotation,
        targetId,
        viewport,
        renderingEngine,
        enabledElement
      );
    }

    this._renderStats(annotation, viewport, enabledElement, svgDrawingHelper);

    return renderStatus;
  }

  _calculateStatsIfActive(
    annotation: PlanarFreehandROIAnnotation,
    targetId: string,
    viewport,
    renderingEngine,
    enabledElement
  ) {
    const activeAnnotationUID = this.commonData?.annotation.annotationUID;

    if (
      annotation.annotationUID === activeAnnotationUID &&
      !this.commonData?.movingTextBox
    ) {
      return;
    }

    if (!this.commonData?.movingTextBox) {
      const { data } = annotation;
      if (!data.cachedStats[targetId]?.unit) {
        data.cachedStats[targetId] = {
          Modality: null,
          area: null,
          max: null,
          mean: null,
          stdDev: null,
          areaUnit: null,
          unit: null,
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
  }

  private _calculateCachedStats = (
    annotation,
    viewport,
    renderingEngine,
    enabledElement
  ) => {
    const { data } = annotation;
    const { cachedStats } = data;
    const { polyline: points, closed } = data.contour;

    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];
      const image = this.getTargetImageData(targetId);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { imageData, metadata } = image;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      const modalityUnitOptions = {
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
        modalityUnitOptions
      );
      const polyline = data.contour.polyline;
      const numPoints = polyline.length;
      const projectedPolyline = new Array(numPoints);

      for (let i = 0; i < numPoints; i++) {
        projectedPolyline[i] = viewport.worldToCanvas(polyline[i]);
      }

      const {
        maxX: canvasMaxX,
        maxY: canvasMaxY,
        minX: canvasMinX,
        minY: canvasMinY,
      } = math.polyline.getAABB(projectedPolyline);

      const topLeftBBWorld = viewport.canvasToWorld([canvasMinX, canvasMinY]);

      const topLeftBBIndex = csUtils.transformWorldToIndex(
        imageData,
        topLeftBBWorld
      );

      const bottomRightBBWorld = viewport.canvasToWorld([
        canvasMaxX,
        canvasMaxY,
      ]);

      const bottomRightBBIndex = csUtils.transformWorldToIndex(
        imageData,
        bottomRightBBWorld
      );

      const handles = [topLeftBBIndex, bottomRightBBIndex];

      const calibratedScale = getCalibratedLengthUnitsAndScale(image, handles);

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

      const statsArgs = {
        targetId,
        viewport,
        canvasCoordinates,
        points,
        imageData,
        metadata,
        cachedStats,
        modalityUnit,
        calibratedScale,
        deltaInX,
        deltaInY,
      };
      if (closed) {
        this.updateClosedCachedStats(statsArgs);
      } else {
        this.updateOpenCachedStats(statsArgs);
      }
    }

    const invalidated = annotation.invalidated;
    annotation.invalidated = false;

    // Dispatching annotation modified only if it was invalidated
    if (invalidated) {
      triggerAnnotationModified(
        annotation,
        enabledElement.viewport.element,
        ChangeTypes.StatsUpdated
      );
    }

    return cachedStats;
  };

  protected updateClosedCachedStats({
    viewport,
    points,
    imageData,
    metadata,
    cachedStats,
    targetId,
    modalityUnit,
    canvasCoordinates,
    calibratedScale,
    deltaInX,
    deltaInY,
  }) {
    const { scale, areaUnit, unit } = calibratedScale;

    const { voxelManager } = viewport.getImageData();

    const indexPoints = points.map((point) => imageData.worldToIndex(point));

    let iMin = Number.MAX_SAFE_INTEGER;
    let iMax = Number.MIN_SAFE_INTEGER;
    let jMin = Number.MAX_SAFE_INTEGER;
    let jMax = Number.MIN_SAFE_INTEGER;
    let kMin = Number.MAX_SAFE_INTEGER;
    let kMax = Number.MIN_SAFE_INTEGER;

    for (let j = 0; j < points.length; j++) {
      const worldPosIndex = indexPoints[j].map(Math.floor);
      iMin = Math.min(iMin, worldPosIndex[0]);
      iMax = Math.max(iMax, worldPosIndex[0]);

      jMin = Math.min(jMin, worldPosIndex[1]);
      jMax = Math.max(jMax, worldPosIndex[1]);

      kMin = Math.min(kMin, worldPosIndex[2]);
      kMax = Math.max(kMax, worldPosIndex[2]);
    }

    let area = polyline.getArea(canvasCoordinates) / scale / scale;
    // Convert from canvas_pixels ^2 to mm^2
    area *= deltaInX * deltaInY;

    const perimeter = PlanarFreehandROITool.calculateLengthInIndex(
      calibratedScale,
      indexPoints,
      closed
    );

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

    let pointsInShape;
    if (voxelManager) {
      pointsInShape = voxelManager.forEach(
        this.configuration.statsCalculator.statsCallback,
        {
          imageData,
          isInObject: (pointLPS, _pointIJK) => {
            let result = true;
            const point = viewport.worldToCanvas(pointLPS);
            if (point[1] != curRow) {
              intersectionCounter = 0;
              curRow = point[1];
              intersections = getLineSegmentIntersectionsCoordinates(
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
          boundsIJK,
          returnPoints: this.configuration.storePointData,
        }
      );
    }
    const stats = this.configuration.statsCalculator.getStatistics();

    const namedArea: Statistics = {
      name: 'area',
      value: area,
      unit: areaUnit,
      type: MeasurementType.Area,
    };
    const namedPerimeter: Statistics = {
      name: 'perimeter',
      value: perimeter,
      unit,
      type: MeasurementType.Linear,
    };
    cachedStats[targetId] = {
      Modality: metadata.Modality,
      area,
      perimeter,
      mean: stats.mean?.value,
      max: stats.max?.value,
      min: stats.min?.value,
      stdDev: stats.stdDev?.value,
      statsArray: [namedArea, namedPerimeter, ...stats.array],
      pointsInShape: pointsInShape,
      /**
       * areaUnit are sizing, eg mm^2 typically
       * modality units are pixel value units, eg HU or other
       * unit is linear measurement unit, eg mm
       */
      areaUnit,
      modalityUnit,
      unit,
    };
  }

  protected updateOpenCachedStats({
    targetId,
    metadata,
    cachedStats,
    modalityUnit,
    calibratedScale,
    imageData,
    points,
  }) {
    const { unit } = calibratedScale;
    const indexPoints = points.map((point) => imageData.worldToIndex(point));
    const length = PlanarFreehandROITool.calculateLengthInIndex(
      calibratedScale,
      indexPoints
    );

    const namedLength: Statistics = {
      name: 'length',
      value: length,
      unit,
      type: MeasurementType.Linear,
    };

    cachedStats[targetId] = {
      Modality: metadata.Modality,
      length,
      modalityUnit,
      unit,
      statArray: [namedLength],
    };
  }

  private _renderStats = (
    annotation,
    viewport,
    enabledElement,
    svgDrawingHelper
  ) => {
    const { data } = <PlanarFreehandROIAnnotation>annotation;
    const targetId = this.getTargetId(viewport, data);

    const styleSpecifier: AnnotationStyle.StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
      annotationUID: annotation.annotationUID,
    };

    const textLines = this.configuration.getTextLines(data, targetId);
    if (!textLines || textLines.length === 0) {
      return;
    }

    const canvasCoordinates = data.contour.polyline.map((p) =>
      viewport.worldToCanvas(p)
    );
    this.renderLinkedTextBoxAnnotation({
      enabledElement,
      svgDrawingHelper,
      annotation,
      styleSpecifier,
      textLines,
      canvasCoordinates,
    });
  };
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const {
    area,
    mean,
    stdDev,
    length,
    perimeter,
    max,
    min,
    isEmptyArea,
    unit,
    areaUnit,
    modalityUnit,
  } = cachedVolumeStats || {};

  const textLines: string[] = [];

  if (csUtils.isNumber(area)) {
    const areaLine = isEmptyArea
      ? `Area: Oblique not supported`
      : `Area: ${csUtils.roundNumber(area)} ${areaUnit}`;
    textLines.push(areaLine);
  }

  if (csUtils.isNumber(mean)) {
    textLines.push(`Mean: ${csUtils.roundNumber(mean)} ${modalityUnit}`);
  }

  if (csUtils.isNumber(max)) {
    textLines.push(`Max: ${csUtils.roundNumber(max)} ${modalityUnit}`);
  }
  if (csUtils.isNumber(min)) {
    textLines.push(`Min: ${csUtils.roundNumber(min)} ${modalityUnit}`);
  }

  if (csUtils.isNumber(stdDev)) {
    textLines.push(`Std Dev: ${csUtils.roundNumber(stdDev)} ${modalityUnit}`);
  }

  if (csUtils.isNumber(perimeter)) {
    textLines.push(`Perimeter: ${csUtils.roundNumber(perimeter)} ${unit}`);
  }

  if (csUtils.isNumber(length)) {
    // No need to show length prefix as there is just the single value
    textLines.push(`${csUtils.roundNumber(length)} ${unit}`);
  }

  return textLines;
}

export default PlanarFreehandROITool;
