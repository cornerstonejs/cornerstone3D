import { AnnotationTool } from '../base';

import {
  getEnabledElement,
  VolumeViewport,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { Events } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import * as rectangle from '../../utilities/math/rectangle';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import getWorldWidthAndHeightFromCorners from '../../utilities/planar/getWorldWidthAndHeightFromCorners';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  ToolProps,
  PublicToolProps,
  InteractionTypes,
  SVGDrawingHelper,
} from '../../types';
import { RectangleROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
} from '../../types/EventTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { getModalityUnit } from '../../utilities/getModalityUnit';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';

const { transformWorldToIndex } = csUtils;

/**
 * RectangleROIAnnotation let you draw annotations that measures the statistics
 * such as area, max, mean and stdDev of a Rectangular region of interest.
 * You can use RectangleROIAnnotation in all perpendicular views (axial, sagittal, coronal).
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference. RectangleROI tool's text box lines are dynamically
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
 * ```js
 * cornerstoneTools.addTool(RectangleROITool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(RectangleROITool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(RectangleROITool.toolName, {
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
class RectangleROITool extends AnnotationTool {
  static toolName;

  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
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
   * a RectangleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): RectangleROIAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

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

    const annotation = {
      invalidated: true,
      highlighted: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
      },
      data: {
        label: '',
        handles: {
          points: [
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
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
        cachedStats: {},
      },
    };

    addAnnotation(element, annotation);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

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
    annotation: RectangleROIAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const { points } = data.handles;

    const canvasPoint1 = viewport.worldToCanvas(points[0]);
    const canvasPoint2 = viewport.worldToCanvas(points[3]);

    const rect = this._getRectangleImageCoordinates([
      canvasPoint1,
      canvasPoint2,
    ]);

    const point = [canvasCoords[0], canvasCoords[1]];
    const { left, top, width, height } = rect;

    const distanceToPoint = rectangle.distanceToPoint(
      [left, top, width, height],
      point as Types.Point2
    );

    if (distanceToPoint <= proximity) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: RectangleROIAnnotation
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

    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: RectangleROIAnnotation,
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
      handleIndex = data.handles.points.findIndex((p) => p === handle);
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

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

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

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this.editData = null;
    this.isDrawing = false;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID, element);
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      const eventType = Events.ANNOTATION_COMPLETED;

      const eventDetail: AnnotationCompletedEventDetail = {
        annotation,
      };

      triggerEvent(eventTarget, eventType, eventDetail);
    }
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;

    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex, movingTextBox } =
      this.editData;
    const { data } = annotation;

    if (movingTextBox) {
      // Drag mode - Move the text boxes world position
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Drag mode - Moving tool, so move all points by the world points delta
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const { points } = data.handles;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      // Moving handle.
      const { currentPoints } = eventDetail;
      const enabledElement = getEnabledElement(element);
      const { worldToCanvas, canvasToWorld } = enabledElement.viewport;
      const worldPos = currentPoints.world;

      const { points } = data.handles;

      // Move this handle.
      points[handleIndex] = [...worldPos];

      let bottomLeftCanvas;
      let bottomRightCanvas;
      let topLeftCanvas;
      let topRightCanvas;

      let bottomLeftWorld;
      let bottomRightWorld;
      let topLeftWorld;
      let topRightWorld;

      switch (handleIndex) {
        case 0:
        case 3:
          // Moving bottomLeft or topRight

          bottomLeftCanvas = worldToCanvas(points[0]);
          topRightCanvas = worldToCanvas(points[3]);

          bottomRightCanvas = [topRightCanvas[0], bottomLeftCanvas[1]];
          topLeftCanvas = [bottomLeftCanvas[0], topRightCanvas[1]];

          bottomRightWorld = canvasToWorld(bottomRightCanvas);
          topLeftWorld = canvasToWorld(topLeftCanvas);

          points[1] = bottomRightWorld;
          points[2] = topLeftWorld;

          break;
        case 1:
        case 2:
          // Moving bottomRight or topLeft
          bottomRightCanvas = worldToCanvas(points[1]);
          topLeftCanvas = worldToCanvas(points[2]);

          bottomLeftCanvas = <Types.Point2>[
            topLeftCanvas[0],
            bottomRightCanvas[1],
          ];
          topRightCanvas = <Types.Point2>[
            bottomRightCanvas[0],
            topLeftCanvas[1],
          ];

          bottomLeftWorld = canvasToWorld(bottomLeftCanvas);
          topRightWorld = canvasToWorld(topRightCanvas);

          points[0] = bottomLeftWorld;
          points[3] = topRightWorld;

          break;
      }
      annotation.invalidated = true;
    }

    this.editData.hasMoved = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
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

      const enabledElement = getEnabledElement(element);
      const { renderingEngine } = enabledElement;

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportIdsToRender
      );

      if (newAnnotation) {
        const eventType = Events.ANNOTATION_COMPLETED;

        const eventDetail: AnnotationCompletedEventDetail = {
          annotation,
        };

        triggerEvent(eventTarget, eventType, eventDetail);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };
  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * Remove event handlers for the modify event loop, and enable default event propagation.
   */
  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the rectangleROI annotation in each
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

    let annotations = getAnnotations(element, this.getToolName());

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
      const annotation = annotations[i] as RectangleROIAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const { viewPlaneNormal, viewUp } = viewport.getCamera();

      // If cachedStats does not exist, or the unit is missing (as part of import/hydration etc.),
      // force to recalculate the stats from the points
      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].unit === undefined
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
          viewPlaneNormal,
          viewUp,
          renderingEngine,
          enabledElement
        );
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          viewPlaneNormal,
          viewUp,
          renderingEngine,
          enabledElement
        );

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related stackViewports data if
        // they are not at the referencedImageId, so that
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
        !isAnnotationLocked(annotation) &&
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

      const dataId = `${annotationUID}-rect`;
      const rectangleUID = '0';
      drawRectSvg(
        svgDrawingHelper,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash,
          lineWidth,
        },
        dataId
      );

      renderStatus = true;

      const isPreScaled = isViewportPreScaled(viewport, targetId);

      const textLines = this._getTextLines(data, targetId, isPreScaled);
      if (!textLines || textLines.length === 0) {
        continue;
      }

      if (!data.handles.textBox.hasMoved) {
        const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

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
        this.getLinkedTextBoxStyle(styleSpecifier, annotation)
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

  _getRectangleImageCoordinates = (
    points: Array<Types.Point2>
  ): {
    left: number;
    top: number;
    width: number;
    height: number;
  } => {
    const [point0, point1] = points;

    return {
      left: Math.min(point0[0], point1[0]),
      top: Math.min(point0[1], point1[1]),
      width: Math.abs(point0[0] - point1[0]),
      height: Math.abs(point0[1] - point1[1]),
    };
  };

  /**
   * _getTextLines - Returns the Area, mean and std deviation of the area of the
   * target volume enclosed by the rectangle.
   *
   * @param data - The annotation tool-specific data.
   * @param targetId - The volumeId of the volume to display the stats for.
   * @param isPreScaled - Whether the viewport is pre-scaled or not.
   */
  _getTextLines = (
    data,
    targetId: string,
    isPreScaled: boolean
  ): string[] | undefined => {
    const cachedVolumeStats = data.cachedStats[targetId];
    const { area, mean, max, stdDev, Modality, areaUnit } = cachedVolumeStats;

    if (mean === undefined) {
      return;
    }

    const textLines: string[] = [];
    const unit = getModalityUnit(Modality, isPreScaled);

    textLines.push(`Area: ${area.toFixed(2)} ${areaUnit}\xb2`);
    textLines.push(`Mean: ${mean.toFixed(2)} ${unit}`);
    textLines.push(`Max: ${max.toFixed(2)} ${unit}`);
    textLines.push(`Std Dev: ${stdDev.toFixed(2)} ${unit}`);

    return textLines;
  };

  /**
   * _calculateCachedStats - For each volume in the frame of reference that a
   * tool instance in particular viewport defines as its target volume, find the
   * volume coordinates (i,j,k) being probed by the two corners. One of i,j or k
   * will be constant across the two points. In the other two directions iterate
   * over the voxels and calculate the first and second-order statistics.
   *
   * @param data - The annotation tool-specific data.
   * @param viewPlaneNormal - The normal vector of the camera.
   * @param viewUp - The viewUp vector of the camera.
   */
  _calculateCachedStats = (
    annotation,
    viewPlaneNormal,
    viewUp,
    renderingEngine,
    enabledElement
  ) => {
    const { data } = annotation;
    const { viewportId, renderingEngineId } = enabledElement;

    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[3];
    const { cachedStats } = data;

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

      const { dimensions, scalarData, imageData, metadata, hasPixelSpacing } =
        image;

      const worldPos1Index = transformWorldToIndex(imageData, worldPos1);

      worldPos1Index[0] = Math.floor(worldPos1Index[0]);
      worldPos1Index[1] = Math.floor(worldPos1Index[1]);
      worldPos1Index[2] = Math.floor(worldPos1Index[2]);

      const worldPos2Index = transformWorldToIndex(imageData, worldPos2);

      worldPos2Index[0] = Math.floor(worldPos2Index[0]);
      worldPos2Index[1] = Math.floor(worldPos2Index[1]);
      worldPos2Index[2] = Math.floor(worldPos2Index[2]);

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      if (this._isInsideVolume(worldPos1Index, worldPos2Index, dimensions)) {
        this.isHandleOutsideImage = false;

        // Calculate index bounds to iterate over

        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0]);
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0]);

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1]);
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1]);

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2]);
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2]);

        const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
          viewPlaneNormal,
          viewUp,
          worldPos1,
          worldPos2
        );

        const area = worldWidth * worldHeight;

        let count = 0;
        let mean = 0;
        let stdDev = 0;
        let max = -Infinity;

        const yMultiple = dimensions[0];
        const zMultiple = dimensions[0] * dimensions[1];

        //Todo: this can be replaced by pointInShapeCallback....
        // This is a triple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i];

              if (value > max) {
                max = value;
              }

              count++;
              mean += value;
            }
          }
        }

        mean /= count;

        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i];

              const valueMinusMean = value - mean;

              stdDev += valueMinusMean * valueMinusMean;
            }
          }
        }

        stdDev /= count;
        stdDev = Math.sqrt(stdDev);

        cachedStats[targetId] = {
          Modality: metadata.Modality,
          area,
          mean,
          stdDev,
          max,
          areaUnit: hasPixelSpacing ? 'mm' : 'px',
        };
      } else {
        this.isHandleOutsideImage = true;
        cachedStats[targetId] = {
          Modality: metadata.Modality,
        };
      }
    }

    annotation.invalidated = false;

    // Dispatching annotation modified
    const eventType = Events.ANNOTATION_MODIFIED;

    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
    };
    triggerEvent(eventTarget, eventType, eventDetail);

    return cachedStats;
  };

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    );
  };
}

RectangleROITool.toolName = 'RectangleROI';
export default RectangleROITool;
