import { AnnotationTool, BaseTool } from '../base';
import { vec2, vec3 } from 'gl-matrix';

import {
  getEnabledElement,
  VolumeViewport,
  utilities as csUtils,
  getEnabledElementByViewportId,
  EPSILON,
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
  drawHandles as drawHandlesSvg,
} from '../../drawingSvg';
import { state } from '../../store/state';
import { ChangeTypes, Events, MeasurementType } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
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
  Statistics,
} from '../../types';
import type { CircleROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { getPixelValueUnits } from '../../utilities/getPixelValueUnits';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';
import {
  getCanvasCircleCorners,
  getCanvasCircleRadius,
} from '../../utilities/math/circle';
import { pointInEllipse } from '../../utilities/math/ellipse';
import { BasicStatsCalculator } from '../../utilities/math/basic';
import { getStyleProperty } from '../../stateManagement/annotation/config/helpers';

const { transformWorldToIndex } = csUtils;

/**
 * CircleROITool let you draw annotations that measures the statistics
 * such as area, max, mean and stdDev of an elliptical region of interest.
 * You can use CircleROITool in all perpendicular views (axial, sagittal, coronal).
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference. Circle tool's text box lines are dynamically
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
 * cornerstoneTools.addTool(CircleROITool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(CircleROITool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(CircleROITool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 *
 * // draw a circle at the center point with 4px radius.
 * toolGroup.setToolConfiguration(CircleROITool.toolName, {
 *   centerPointRadius: 4,
 * });
 * ```
 *
 * Read more in the Docs section of the website.
 */

class CircleROITool extends AnnotationTool {
  static toolName = 'CircleROI';

  _throttledCalculateCachedStats: Function;
  editData: {
    annotation: Annotation;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    movingTextBox?: boolean;
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
        // Radius of the circle to draw  at the center point of the circle.
        // Set this zero(0) in order not to draw the circle.
        centerPointRadius: 0,
        calculateStats: true,
        getTextLines: defaultGetTextLines,
        statsCalculator: BasicStatsCalculator,
        simplified: true, // If true, only 2 points are used for the handles, otherwise 5 points are used
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

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a CircleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): CircleROIAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    this.isDrawing = true;

    let points;
    if (this.configuration.simplified) {
      points = [[...worldPos], [...worldPos]] as [Types.Point3, Types.Point3];
    } else {
      points = [
        [...worldPos],
        [...worldPos],
        [...worldPos],
        [...worldPos],
        [...worldPos],
      ] as [
        Types.Point3,
        Types.Point3,
        Types.Point3,
        Types.Point3,
        Types.Point3,
      ];
    }

    const annotation = <CircleROIAnnotation>this.createAnnotation(evt, points);

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
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
    annotation: CircleROIAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { points } = annotation.data.handles;
    const canvasHandles = points.map((p) => viewport.worldToCanvas(p));
    const canvasCenter = canvasHandles[0];
    const radius = getCanvasCircleRadius([canvasCenter, canvasHandles[1]]);
    const radiusPoint = getCanvasCircleRadius([canvasCenter, canvasCoords]);

    return Math.abs(radiusPoint - radius) < proximity / 2;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: CircleROIAnnotation
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

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: CircleROIAnnotation,
    handle: ToolHandle
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    let movingTextBox = false;
    let handleIndex;

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      const { points } = data.handles;

      handleIndex = points.findIndex((p) => p === handle);
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

    // Circle ROI tool should reset its highlight to false on mouse up (as opposed
    // to other tools that keep it highlighted until the user moves. The reason
    // is that we use top-left and bottom-right handles to define the circle,
    // and they are by definition not in the circle on mouse up.
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
    const { element, currentPoints } = eventDetail;
    const { world: worldPos, canvas: currentCanvasPoints } = currentPoints;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
    this.createMemo(element, annotation, { newAnnotation });
    const { data } = annotation;
    const centerWorld = data.handles.points[0];
    const centerCanvas = viewport.worldToCanvas(centerWorld as Types.Point3);

    if (this.configuration.simplified) {
      data.handles.points[1] = worldPos;
    } else {
      const radiusCanvas = vec2.distance(centerCanvas, currentCanvasPoints);

      // Update other handles based on the new radius
      data.handles.points[0] = [...centerWorld];
      data.handles.points[1] = canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] - radiusCanvas,
      ]);
      data.handles.points[2] = canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] + radiusCanvas,
      ]);
      data.handles.points[3] = canvasToWorld([
        centerCanvas[0] - radiusCanvas,
        centerCanvas[1],
      ]);
      data.handles.points[4] = canvasToWorld([
        centerCanvas[0] + radiusCanvas,
        centerCanvas[1],
      ]);
    }

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
    const enabledElement = getEnabledElement(element);
    const { canvasToWorld, worldToCanvas } = enabledElement.viewport;

    const { annotation, handleIndex } = this.editData;
    const { data } = annotation;
    const { points } = data.handles;

    const { currentPoints, deltaPoints } = eventDetail;

    // If the handleIndex is 0, it means we are moving the whole ROI
    if (handleIndex === 0) {
      const worldPosDelta = deltaPoints.world;

      points.forEach((point) => {
        vec3.add(point, point, worldPosDelta);
      });
    } else {
      const centerWorld = points[0];
      const centerCanvas = worldToCanvas(centerWorld);
      const currentCanvasPoint = currentPoints.canvas;

      const newRadiusCanvas = vec2.distance(centerCanvas, currentCanvasPoint);
      //Update the handles based on the new radius
      points[1] = canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] - newRadiusCanvas,
      ]); // Top
      points[2] = canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] + newRadiusCanvas,
      ]); // Bottom
      points[3] = canvasToWorld([
        centerCanvas[0] - newRadiusCanvas,
        centerCanvas[1],
      ]); // Left
      points[4] = canvasToWorld([
        centerCanvas[0] + newRadiusCanvas,
        centerCanvas[1],
      ]); // Right
    }
    annotation.invalidated = true;
  };

  cancel = (element: HTMLDivElement) => {
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      annotation.highlighted = false;
      annotation.data.handles.activeHandleIndex = null;

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
   * it is used to draw the circleROI annotation in each
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

    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as CircleROIAnnotation;
      const { annotationUID, data } = annotation;
      const { handles } = data;
      const { points, activeHandleIndex } = handles;

      const targetId = this.getTargetId(viewport, data);
      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const canvasCoordinates: Types.Point2[] = points.map((p) =>
        viewport.worldToCanvas(p)
      );
      const center = canvasCoordinates[0];
      const radius = getCanvasCircleRadius([center, canvasCoordinates[1]]);
      const canvasCorners = getCanvasCircleCorners([
        center,
        canvasCoordinates[1],
      ]);

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
          radius: null,
          radiusUnit: null,
          perimeter: null,
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
        if (this.configuration.simplified) {
          activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
        } else {
          activeHandleCanvasCoords = canvasCoordinates;
        }
      }

      const showHandlesAlways = Boolean(
        getStyleProperty('showHandlesAlways', {} as StyleSpecifier)
      );
      if (activeHandleCanvasCoords || showHandlesAlways) {
        const handleGroupUID = '0';
        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          showHandlesAlways ? canvasCoordinates : activeHandleCanvasCoords,
          {
            color,
          }
        );
      }

      const dataId = `${annotationUID}-circle`;
      const circleUID = '0';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID,
        center,
        radius,
        {
          color,
          lineDash,
          lineWidth,
        },
        dataId
      );

      // draw center point, if "centerPointRadius" configuration is valid.
      if (centerPointRadius > 0) {
        if (radius > 3 * centerPointRadius) {
          drawCircleSvg(
            svgDrawingHelper,
            annotationUID,
            `${circleUID}-center`,
            center,
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

      if (this.configuration.calculateStats) {
        const textLines = this.configuration.getTextLines(data, targetId);
        if (!textLines || textLines.length === 0) {
          continue;
        }
        const linkAnchorPoints: Types.Point2[] = [center, canvasCoordinates[1]];
        if (
          !this.renderLinkedTextBoxAnnotation({
            enabledElement,
            svgDrawingHelper,
            annotation,
            styleSpecifier,
            textLines,
            canvasCoordinates: linkAnchorPoints,
            placementPoints: canvasCorners,
          })
        ) {
          continue;
        }
      }
    }

    return renderStatus;
  };

  _calculateCachedStats = (
    annotation,
    viewport,
    _renderingEngine,
    _enabledElement
  ) => {
    if (!this.configuration.calculateStats) {
      return;
    }
    const { data } = annotation;
    const { element } = viewport;

    const wasInvalidated = annotation.invalidated;

    const { points } = data.handles;

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
    const canvasCenter = canvasCoordinates[0] as Types.Point2;
    const canvasTop = canvasCoordinates[1] as Types.Point2;

    const [topLeftCanvas, bottomRightCanvas] = <Array<Types.Point2>>(
      getCanvasCircleCorners([canvasCenter, canvasTop])
    );

    const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
    const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);
    const { cachedStats } = data;

    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];
      const image = this.getTargetImageData(targetId);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        console.warn('image not found for stats:', targetId);
        // Better clean the stats for this targetId
        delete cachedStats[targetId];
        continue;
      }

      const { dimensions, imageData, metadata, voxelManager } = image;

      const handles = points.map((point) => imageData.worldToIndex(point));
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      // Representation is either simplified 2 points or 5 points, so we need to slice the handles to get the correct handles
      const radius = CircleROITool.calculateLengthInIndex(
        calibrate,
        handles.slice(0, 2)
      );
      const area = Math.PI * radius * radius;
      const perimeter = 2 * Math.PI * radius;
      const isEmptyArea = radius === 0;
      const { unit, areaUnit } = calibrate;

      // Generates a basic cached stats.
      const namedArea: Statistics = {
        name: 'area',
        value: area,
        unit: areaUnit,
        type: MeasurementType.Area,
      };
      const namedCircumference: Statistics = {
        name: 'circumference',
        value: perimeter,
        unit,
        type: MeasurementType.Linear,
      };
      const namedRadius: Statistics = {
        name: 'radius',
        value: radius,
        unit,
        type: MeasurementType.Linear,
      };
      const statsArray = [namedArea, namedRadius, namedCircumference];

      cachedStats[targetId] = {
        Modality: metadata.Modality,
        area,
        isEmptyArea,
        areaUnit,
        radius,
        radiusUnit: unit,
        perimeter,
        statsArray,
      };

      const pos1Index = transformWorldToIndex(imageData, topLeftWorld);
      const pos2Index = transformWorldToIndex(imageData, bottomRightWorld);

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      this.isHandleOutsideImage = !BaseTool.isInsideVolume(dimensions, [
        pos1Index,
        pos2Index,
      ]);

      if (!this.isHandleOutsideImage) {
        const iMin = Math.min(pos1Index[0], pos2Index[0]);
        const iMax = Math.max(pos1Index[0], pos2Index[0]);

        const jMin = Math.min(pos1Index[1], pos2Index[1]);
        const jMax = Math.max(pos1Index[1], pos2Index[1]);

        const kMin = Math.min(pos1Index[2], pos2Index[2]);
        const kMax = Math.max(pos1Index[2], pos2Index[2]);

        const boundsIJK = [
          [iMin, iMax],
          [jMin, jMax],
          [kMin, kMax],
        ] as [Types.Point2, Types.Point2, Types.Point2];

        const center = points[0];

        const xRadius = Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2;
        const yRadius = Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2;
        const zRadius = Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2;

        const ellipseObj = {
          center,
          xRadius: xRadius < EPSILON / 2 ? 0 : xRadius,
          yRadius: yRadius < EPSILON / 2 ? 0 : yRadius,
          zRadius: zRadius < EPSILON / 2 ? 0 : zRadius,
        };

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

        let pointsInShape;
        if (voxelManager) {
          pointsInShape = voxelManager.forEach(
            this.configuration.statsCalculator.statsCallback,
            {
              isInObject: (pointLPS) =>
                pointInEllipse(ellipseObj, pointLPS, { fast: true }),
              boundsIJK,
              imageData,
              returnPoints: this.configuration.storePointData,
            }
          );
        }
        const stats = this.configuration.statsCalculator.getStatistics();

        cachedStats[targetId] = {
          ...cachedStats[targetId],
          Modality: metadata.Modality,
          mean: stats.mean?.value,
          max: stats.max?.value,
          min: stats.min?.value,
          pointsInShape,
          stdDev: stats.stdDev?.value,
          modalityUnit,
          statsArray: [...statsArray, ...stats.array],
        };
      }
    }

    annotation.invalidated = false;

    // Dispatching annotation modified
    if (wasInvalidated) {
      triggerAnnotationModified(annotation, element, ChangeTypes.StatsUpdated);
    }

    return cachedStats;
  };

  static hydrate = (
    viewportId: string,
    points: Types.Point3[],
    options?: {
      annotationUID?: string;
      toolInstance?: CircleROITool;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): CircleROIAnnotation => {
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
    } = this.hydrateBase<CircleROITool>(
      CircleROITool,
      enabledElement,
      points,
      options
    );

    // Exclude toolInstance from the options passed into the metadata
    const { toolInstance, ...serializableOptions } = options || {};

    const annotation = {
      annotationUID: options?.annotationUID || csUtils.uuidv4(),
      data: {
        handles: {
          points,
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
        ...serializableOptions,
      },
    };

    addAnnotation(annotation, viewport.element);

    triggerAnnotationRenderForViewportIds([viewport.id]);
  };
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const {
    radius,
    radiusUnit,
    area,
    mean,
    stdDev,
    max,
    min,
    isEmptyArea,
    areaUnit,
    modalityUnit,
  } = cachedVolumeStats;
  const textLines: string[] = [];

  if (csUtils.isNumber(radius)) {
    const radiusLine = isEmptyArea
      ? `Radius: Oblique not supported`
      : `Radius: ${csUtils.roundNumber(radius)} ${radiusUnit}`;
    textLines.push(radiusLine);
  }

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

  return textLines;
}

export default CircleROITool;
