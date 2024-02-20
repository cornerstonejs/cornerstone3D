import {
  StackViewport,
  Types,
  cache,
  getEnabledElement,
  utilities as csUtils,
  metaData,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';

import { vec3 } from 'gl-matrix';
import { Events } from '../../enums';
import {
  addAnnotation,
  removeAnnotation,
  getAnnotations,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import {
  drawCircle as drawCircleSvg,
  drawHandles as drawHandlesSvg,
} from '../../drawingSvg';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import throttle from '../../utilities/throttle';
import { AnnotationModifiedEventDetail } from '../../types/EventTypes';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  hideElementCursor,
  resetElementCursor,
} from '../../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { triggerAnnotationCompleted } from '../../stateManagement/annotation/helpers/state';
import {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import { CircleROIStartEndThresholdAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import CircleROITool from '../annotation/CircleROITool';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import {
  getCanvasCircleCorners,
  getCanvasCircleRadius,
} from '../../utilities/math/circle';
import { pointInEllipse } from '../../utilities/math/ellipse';
import { pointInShapeCallback } from '../../utilities';

const { transformWorldToIndex } = csUtils;

class CircleROIStartEndThresholdTool extends CircleROITool {
  static toolName;

  touchDragCallback: any;
  mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
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
        numSlicesToPropagate: 10,
        calculatePointsInsideVolume: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStatsTool,
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
  addNewAnnotation = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    let referencedImageId, imageVolume, volumeId;
    if (viewport instanceof StackViewport) {
      throw new Error('Stack Viewport Not implemented');
    } else {
      const targetId = this.getTargetId(viewport);
      volumeId = targetId.split(/volumeId:|\?/)[1];
      imageVolume = cache.getVolume(volumeId);

      referencedImageId = csUtils.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal
      );
    }

    // if (!referencedImageId) {
    //   throw new Error('This tool does not work on non-acquisition planes');
    // }

    const spacingInNormal = csUtils.getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );

    const newStartIndex = this._getStartSliceIndex(
      imageVolume,
      worldPos,
      spacingInNormal,
      viewPlaneNormal
    );

    // We cannot newStartIndex add numSlicesToPropagate to startIndex because
    // the order of imageIds can be from top to bottom or bottom to top and
    // we want to make sure it is always propagated in the direction of the
    // view and also to make sure we don't go out of bounds.
    const endIndex = this._getEndSliceIndex(
      imageVolume,
      worldPos,
      spacingInNormal,
      viewPlaneNormal
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
        volumeId,
        spacingInNormal,
        enabledElement,
      },
      data: {
        label: '',
        startSlice: newStartIndex,
        endSlice: endIndex,

        handles: {
          textBox: {
            hasMoved: false,
            worldPosition: null,
            worldBoundingBox: null,
          },
          points: [[...worldPos], [...worldPos]] as [
            Types.Point3, // center
            Types.Point3 // end
          ],
          activeHandleIndex: null,
        },
        cachedStats: {
          pointsInVolume: [],
          projectionPoints: [],
        },
        labelmapUID: null,
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
      newAnnotation: true,
      hasMoved: false,
    };

    this._activateDraw(element);
    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
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

    // Circle ROI tool should reset its highlight to false on mouse up (as opposed
    // to other tools that keep it highlighted until the user moves. The reason
    // is that we use top-left and bottom-right handles to define the circle,
    // and they are by definition not in the circle on mouse up.
    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);

    this.editData = null;
    this.isDrawing = false;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    const targetId = this.getTargetId(enabledElement.viewport);
    const imageVolume = cache.getVolume(targetId.split(/volumeId:|\?/)[1]);

    if (this.configuration.calculatePointsInsideVolume) {
      this._computePointsInsideVolume(annotation, imageVolume, enabledElement);
    }

    triggerAnnotationRenderForViewportIds(
      enabledElement.renderingEngine,
      viewportIdsToRender
    );

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }
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

    const annotations = getAnnotations(this.getToolName(), viewport.element);

    if (!annotations?.length) {
      return renderStatus;
    }

    const sliceIndex = viewport.getCurrentImageIdIndex();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as CircleROIStartEndThresholdAnnotation;
      const { annotationUID, data } = annotation;
      const { startSlice, endSlice } = data;
      const { points, activeHandleIndex } = data.handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Types.Point2, Types.Point2];
      const center = canvasCoordinates[0];

      const radius = getCanvasCircleRadius(canvasCoordinates);
      const { centerPointRadius } = this.configuration;

      // range of slices to render based on the start and end slice, like
      // np.arange

      // if indexIJK is outside the start/end slice, we don't render
      if (
        sliceIndex < Math.min(startSlice, endSlice) ||
        sliceIndex > Math.max(startSlice, endSlice)
      ) {
        continue;
      }

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT

      if (annotation.invalidated) {
        this._throttledCalculateCachedStats(annotation, enabledElement);
      }

      const middleSlice = Math.round((startSlice + endSlice) / 2);
      // if it is inside the start/end slice, but not exactly the first or
      // last slice, we render the line in dash, but not the handles

      let isMiddleSlice = false;
      if (sliceIndex === middleSlice) {
        isMiddleSlice = true;
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
        activeHandleIndex !== null &&
        isMiddleSlice
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

      let lineWidthToUse = lineWidth;

      if (isMiddleSlice) {
        lineWidthToUse = 3;
      }

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
          lineWidth: lineWidthToUse,
        }
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
    }

    return renderStatus;
  };

  // Todo: make it work for planes other than acquisition planes
  _computeProjectionPoints(
    annotation: CircleROIStartEndThresholdAnnotation,
    imageVolume: Types.IImageVolume
  ): void {
    const { data, metadata } = annotation;
    const { viewPlaneNormal, spacingInNormal } = metadata;
    const { imageData } = imageVolume;
    const { startSlice, endSlice } = data;
    const { points } = data.handles;

    const startIJK = transformWorldToIndex(imageData, points[0]);
    startIJK[2] = startSlice;

    if (startIJK[2] !== startSlice) {
      throw new Error('Start slice does not match');
    }

    // substitute the end slice index 2 with startIJK index 2
    const endIJK = vec3.fromValues(startIJK[0], startIJK[1], endSlice);

    const startWorld = vec3.create();
    imageData.indexToWorldVec3(startIJK, startWorld);

    const endWorld = vec3.create();
    imageData.indexToWorldVec3(endIJK, endWorld);

    // distance between start and end slice in the world coordinate
    const distance = vec3.distance(startWorld, endWorld);

    // for each point inside points, navigate in the direction of the viewPlaneNormal
    // with amount of spacingInNormal, and calculate the next slice until we reach the distance
    const newProjectionPoints = [];
    for (let dist = 0; dist < distance; dist += spacingInNormal) {
      newProjectionPoints.push(
        points.map((point) => {
          const newPoint = vec3.create();
          //@ts-ignore
          vec3.scaleAndAdd(newPoint, point, viewPlaneNormal, dist);
          return Array.from(newPoint);
        })
      );
    }

    data.cachedStats.projectionPoints = newProjectionPoints;
  }

  _computePointsInsideVolume(annotation, imageVolume, enabledElement) {
    const { data } = annotation;
    const { viewport } = enabledElement;
    const projectionPoints = data.cachedStats.projectionPoints;

    const pointsInsideVolume: Types.Point3[][] = [[]];

    for (let i = 0; i < projectionPoints.length; i++) {
      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!imageVolume) {
        continue;
      }

      const centerWorld = projectionPoints[i][0];
      const canvasCoordinates = projectionPoints[i].map((p) =>
        viewport.worldToCanvas(p)
      );

      const [topLeftCanvas, bottomRightCanvas] = <Array<Types.Point2>>(
        getCanvasCircleCorners(canvasCoordinates)
      );

      const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
      const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);

      const worldPos1 = topLeftWorld;
      const worldPos2 = bottomRightWorld;

      const { dimensions, imageData } = imageVolume;

      const worldPos1Index = transformWorldToIndex(imageData, worldPos1);
      const worldCenterIndex = transformWorldToIndex(imageData, centerWorld);

      worldPos1Index[0] = Math.floor(worldPos1Index[0]);
      worldPos1Index[1] = Math.floor(worldPos1Index[1]);
      worldPos1Index[2] = Math.floor(worldCenterIndex[2]);

      const worldPos2Index = transformWorldToIndex(imageData, worldPos2);

      worldPos2Index[0] = Math.floor(worldPos2Index[0]);
      worldPos2Index[1] = Math.floor(worldPos2Index[1]);
      worldPos2Index[2] = Math.floor(worldCenterIndex[2]);

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      if (this._isInsideVolume(worldPos1Index, worldPos2Index, dimensions)) {
        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0]);
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0]);

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1]);
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1]);

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2]);
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2]);

        const boundsIJK = [
          [iMin, iMax],
          [jMin, jMax],
          [kMin, kMax],
        ] as [Types.Point2, Types.Point2, Types.Point2];

        const center = centerWorld as Types.Point3;

        const ellipseObj = {
          center,
          xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
          yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
          zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
        };

        const pointsInShape = pointInShapeCallback(
          imageData,
          //@ts-ignore
          (pointLPS) => pointInEllipse(ellipseObj, pointLPS),
          null,
          boundsIJK
        );

        //@ts-ignore
        pointsInsideVolume.push(pointsInShape);
      }
    }
    data.cachedStats.pointsInVolume = pointsInsideVolume;
  }

  _calculateCachedStatsTool(annotation, enabledElement) {
    const data = annotation.data;
    const { viewportId, renderingEngineId, viewport } = enabledElement;

    const { cachedStats } = data;
    const targetId = this.getTargetId(viewport);
    const imageVolume = cache.getVolume(targetId.split(/volumeId:|\?/)[1]);

    // Todo: this shouldn't be here, this is a performance issue
    // Since we are extending the RectangleROI class, we need to
    // bring the logic for handle to some cachedStats calculation
    this._computeProjectionPoints(annotation, imageVolume);

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
  }

  _getStartSliceIndex(
    imageVolume: Types.IImageVolume,
    worldPos: Types.Point3,
    spacingInNormal: number,
    viewPlaneNormal: Types.Point3
  ): number | undefined {
    const numSlicesToPropagate = this.configuration.numSlicesToPropagate;

    const numSlicesToPropagateFromStart = Math.round(numSlicesToPropagate / 2);
    // get end position by moving from worldPos in the direction of viewplaneNormal
    // with amount of numSlicesToPropagate * spacingInNormal
    const startPos = vec3.create();
    vec3.scaleAndAdd(
      startPos,
      worldPos,
      viewPlaneNormal,
      numSlicesToPropagateFromStart * -spacingInNormal
    );

    const imageIdIndex = this._getImageIdIndex(
      imageVolume,
      startPos,
      spacingInNormal,
      viewPlaneNormal
    );

    return imageIdIndex;
  }

  _getEndSliceIndex(
    imageVolume: Types.IImageVolume,
    worldPos: Types.Point3,
    spacingInNormal: number,
    viewPlaneNormal: Types.Point3
  ): number | undefined {
    const numSlicesToPropagate = this.configuration.numSlicesToPropagate;
    const numSlicesToPropagateFromStart = Math.round(numSlicesToPropagate / 2);

    // get end position by moving from worldPos in the direction of viewplaneNormal
    // with amount of numSlicesToPropagate * spacingInNormal
    const endPos = vec3.create();
    vec3.scaleAndAdd(
      endPos,
      worldPos,
      viewPlaneNormal,
      numSlicesToPropagateFromStart * spacingInNormal
    );

    const imageIdIndex = this._getImageIdIndex(
      imageVolume,
      endPos,
      spacingInNormal,
      viewPlaneNormal
    );

    return imageIdIndex;
  }

  _getImageIdIndex(
    imageVolume: Types.IImageVolume,
    pos: vec3,
    spacingInNormal: number,
    viewPlaneNormal: Types.Point3
  ): number | undefined {
    const halfSpacingInNormalDirection = spacingInNormal / 2;
    // Loop through imageIds of the imageVolume and find the one that is closest to endPos
    const { imageIds } = imageVolume;
    let imageIdIndex;
    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];

      const { imagePositionPatient } = metaData.get(
        'imagePlaneModule',
        imageId
      );

      const dir = vec3.create();
      vec3.sub(dir, pos, imagePositionPatient);

      const dot = vec3.dot(dir, viewPlaneNormal);

      if (Math.abs(dot) < halfSpacingInNormalDirection) {
        imageIdIndex = i;
      }
    }

    return imageIdIndex;
  }
}

CircleROIStartEndThresholdTool.toolName = 'CircleROIStartEndThreshold';
export default CircleROIStartEndThresholdTool;
