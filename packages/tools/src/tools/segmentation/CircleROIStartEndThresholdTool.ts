import type { Types } from '@cornerstonejs/core';
import {
  StackViewport,
  cache,
  getEnabledElement,
  utilities as csUtils,
  utilities as coreUtils,
} from '@cornerstonejs/core';

import { vec3 } from 'gl-matrix';
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
import getWorldWidthAndHeightFromTwoPoints from '../../utilities/planar/getWorldWidthAndHeightFromTwoPoints';
import throttle from '../../utilities/throttle';
import debounce from '../../utilities/debounce';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  hideElementCursor,
  resetElementCursor,
} from '../../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import type {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
  Annotation,
  AnnotationMetadata,
} from '../../types';
import type {
  CircleROIStartEndThresholdAnnotation,
  ROICachedStats,
} from '../../types/ToolSpecificAnnotationTypes';
import CircleROITool from '../annotation/CircleROITool';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import {
  getCanvasCircleCorners,
  getCanvasCircleRadius,
} from '../../utilities/math/circle';
import {
  getCalibratedLengthUnitsAndScale,
  getCalibratedAspect,
} from '../../utilities/getCalibratedUnits';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';
import { pointInEllipse } from '../../utilities/math/ellipse';
import { BasicStatsCalculator } from '../../utilities/math/basic';

import { filterAnnotationsWithinSamePlane } from '../../utilities/planar';
import { getPixelValueUnits } from '../../utilities/getPixelValueUnits';

const { transformWorldToIndex } = csUtils;

class CircleROIStartEndThresholdTool extends CircleROITool {
  static toolName;

  _throttledCalculateCachedStats: Function;
  editData: {
    annotation: Annotation;
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
        //Simplified handles, if false (5 handles : center, top, bottom, left, right)
        simplified: true,
        // Whether to store point data in the annotation
        storePointData: false,
        numSlicesToPropagate: 10,
        calculatePointsInsideVolume: true,
        getTextLines: defaultGetTextLines,
        statsCalculator: BasicStatsCalculator,
        showTextBox: false,
        throttleTimeout: 100,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    if (this.configuration.calculatePointsInsideVolume) {
      this._throttledCalculateCachedStats = throttle(
        this._calculateCachedStatsTool,
        this.configuration.throttleTimeout,
        { trailing: true }
      );
    } else {
      this._throttledCalculateCachedStats = debounce(
        this._calculateCachedStatsTool,
        this.configuration.throttleTimeout
      );
    }
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
      volumeId = csUtils.getVolumeId(targetId);
      imageVolume = cache.getVolume(volumeId);

      referencedImageId = csUtils.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal
      );
    }

    const spacingInNormal = csUtils.getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );

    const startCoord = this._getStartCoordinate(
      worldPos,
      spacingInNormal,
      viewPlaneNormal
    );

    // We cannot simply add numSlicesToPropagate to startIndex because
    // the order of imageIds can be from top to bottom or bottom to top and
    // we want to make sure it is always propagated in the direction of the
    // view and also to make sure we don't go out of bounds.
    const endCoord = this._getEndCoordinate(
      worldPos,
      spacingInNormal,
      viewPlaneNormal
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    let points;
    if (this.configuration.simplified) {
      points = [[...worldPos], [...worldPos]] as [Types.Point3, Types.Point3];
    } else {
      points = [
        [...worldPos], // center
        [...worldPos], // top
        [...worldPos], // bottom
        [...worldPos], // left
        [...worldPos], // right
      ] as [
        Types.Point3,
        Types.Point3,
        Types.Point3,
        Types.Point3,
        Types.Point3,
      ];
    }

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
        startCoordinate: startCoord,
        endCoordinate: endCoord,

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
          points,
          activeHandleIndex: null,
        },
        cachedStats: {
          pointsInVolume: [],
          projectionPoints: [],
          statistics: [] as unknown as ROICachedStats,
        },
        labelmapUID: null,
      },
    };

    // update the projection points in 3D space, since we are projecting
    // the points to the slice plane, we need to make sure the points are
    // computed for later export
    this._computeProjectionPoints(annotation, imageVolume);

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

    const { metadata } = annotation;
    const { enabledElement } = metadata;

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

    this._computePointsInsideVolume(
      annotation,
      imageVolume,
      targetId,
      enabledElement
    );

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    } else {
      triggerAnnotationModified(annotation, element);
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
    let annotations = getAnnotations(this.getToolName(), viewport.element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = filterAnnotationsWithinSamePlane(
      annotations,
      viewport.getCamera()
    );

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as CircleROIStartEndThresholdAnnotation;

      const { annotationUID, data, metadata } = annotation;
      const { startCoordinate, endCoordinate } = data;
      const { points, activeHandleIndex } = data.handles;
      const { enabledElement: annotationEnabledElement } = metadata;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates: Types.Point2[] = points.map((p) =>
        viewport.worldToCanvas(p)
      );
      const center = canvasCoordinates[0];

      const radius = getCanvasCircleRadius([
        canvasCoordinates[0],
        canvasCoordinates[1],
      ]);
      const { centerPointRadius } = this.configuration;
      const canvasCorners = getCanvasCircleCorners([
        canvasCoordinates[0],
        canvasCoordinates[1],
      ]);
      // range of slices to render based on the start and end slice, like
      // np.arange

      const focalPoint = viewport.getCamera().focalPoint;
      const viewplaneNormal = viewport.getCamera().viewPlaneNormal;

      let tempStartCoordinate: number | vec3 = startCoordinate;
      let tempEndCoordinate: number | vec3 = endCoordinate;
      if (Array.isArray(startCoordinate)) {
        tempStartCoordinate = this._getCoordinateForViewplaneNormal(
          tempStartCoordinate,
          viewplaneNormal
        );
        data.startCoordinate = tempStartCoordinate;
      }
      if (Array.isArray(endCoordinate)) {
        tempEndCoordinate = this._getCoordinateForViewplaneNormal(
          tempEndCoordinate,
          viewplaneNormal
        );
        data.endCoordinate = tempEndCoordinate;
      }

      const roundedStartCoordinate = coreUtils.roundToPrecision(
        data.startCoordinate
      );
      const roundedEndCoordinate = coreUtils.roundToPrecision(
        data.endCoordinate
      );

      const cameraCoordinate = this._getCoordinateForViewplaneNormal(
        focalPoint,
        viewplaneNormal
      );
      const roundedCameraCoordinate =
        coreUtils.roundToPrecision(cameraCoordinate);

      // if the focalpoint is outside the start/end coordinates, we don't render
      if (
        roundedCameraCoordinate <
          Math.min(roundedStartCoordinate, roundedEndCoordinate) ||
        roundedCameraCoordinate >
          Math.max(roundedStartCoordinate, roundedEndCoordinate)
      ) {
        continue;
      }
      const middleCoordinate = coreUtils.roundToPrecision(
        (data.startCoordinate + data.endCoordinate) / 2
      );
      // if it is inside the start/end slice, but not exactly the first or
      // last slice, we render the line in dash, but not the handles

      let isMiddleSlice = false;
      if (roundedCameraCoordinate === middleCoordinate) {
        isMiddleSlice = true;
      }

      data.handles.points[0][
        this._getIndexOfCoordinatesForViewplaneNormal(viewplaneNormal)
      ] = middleCoordinate;

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT
      const iteratorVolumeIDs =
        // @ts-ignore
        annotationEnabledElement.viewport?.volumeIds.values();

      for (const volumeId of iteratorVolumeIDs) {
        if (
          annotation.invalidated &&
          annotation.metadata.volumeId === volumeId
        ) {
          this._throttledCalculateCachedStats(
            annotation,
            annotationEnabledElement
          );
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
        activeHandleIndex !== null &&
        isMiddleSlice
      ) {
        if (this.configuration.simplified) {
          activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
        } else {
          activeHandleCanvasCoords = canvasCoordinates;
        }
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
      let lineDashToUse = lineDash;

      if (isMiddleSlice) {
        lineWidthToUse = lineWidth;
        lineDashToUse = []; // Use solid line for real line
      } else {
        lineDashToUse = [5, 5]; // Use dashed line for projected lines
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
          lineDash: lineDashToUse,
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

      if (this.configuration.showTextBox) {
        const textLines = this.configuration.getTextLines(data, { metadata });
        if (!textLines || textLines.length === 0) {
          continue;
        }
        const linkAnchorPoints: Types.Point2[] = [
          canvasCoordinates[0],
          canvasCoordinates[1],
        ];
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

  _computeProjectionPoints(
    annotation: CircleROIStartEndThresholdAnnotation,
    imageVolume: Types.IImageVolume
  ): void {
    const { data, metadata } = annotation;
    const { viewPlaneNormal, spacingInNormal } = metadata;
    const { startCoordinate, endCoordinate } = data;
    const { points } = data.handles;

    const projectionAxisIndex =
      this._getIndexOfCoordinatesForViewplaneNormal(viewPlaneNormal);

    const startWorld = vec3.clone(points[0]);
    startWorld[projectionAxisIndex] = startCoordinate;

    const endWorld = vec3.clone(points[0]);
    endWorld[projectionAxisIndex] = endCoordinate;

    const direction = vec3.create();
    vec3.subtract(direction, endWorld, startWorld);

    const distance = vec3.length(direction);

    if (distance === 0) {
      const handlesOnStartPlane = points.map((p) => {
        const newPoint = vec3.clone(p as vec3);
        newPoint[projectionAxisIndex] = startCoordinate;
        return Array.from(newPoint) as Types.Point3;
      });
      data.cachedStats.projectionPoints = [handlesOnStartPlane];
      return;
    }

    vec3.normalize(direction, direction);

    const handlesToStart = csUtils.deepClone(points) as typeof points;
    handlesToStart[0][projectionAxisIndex] = startCoordinate;
    handlesToStart[1][projectionAxisIndex] = startCoordinate;

    const newProjectionPoints = [];
    for (let dist = 0; dist <= distance + 1e-6; dist += spacingInNormal) {
      newProjectionPoints.push(
        handlesToStart.map((point) => {
          const newPoint = vec3.create();
          vec3.scaleAndAdd(newPoint, point as vec3, direction, dist);
          return Array.from(newPoint) as Types.Point3;
        })
      );
    }

    data.cachedStats.projectionPoints = newProjectionPoints;
  }

  _computePointsInsideVolume(
    annotation,
    imageVolume,
    targetId,
    enabledElement
  ) {
    const { data, metadata } = annotation;
    const { viewPlaneNormal, viewUp } = metadata;
    const { viewport } = enabledElement;
    const projectionPoints = data.cachedStats.projectionPoints;

    const pointsInsideVolume: Types.Point3[][] = [[]];

    const image = this.getTargetImageData(targetId);

    const canvasCoordinates = data.handles.points.map((p) =>
      viewport.worldToCanvas(p)
    );

    const baseTopLeftCanvas = getCanvasCircleCorners([
      canvasCoordinates[0],
      canvasCoordinates[1],
    ])[0];
    const baseBottomRightCanvas = getCanvasCircleCorners([
      canvasCoordinates[0],
      canvasCoordinates[1],
    ])[1];

    const basePos1 = viewport.canvasToWorld(baseTopLeftCanvas);
    const basePos2 = viewport.canvasToWorld(baseBottomRightCanvas);

    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
      viewPlaneNormal,
      viewUp,
      basePos1,
      basePos2
    );
    const measureInfo = getCalibratedLengthUnitsAndScale(
      image,
      data.handles.points
    );
    const aspect = getCalibratedAspect(image);
    const area = Math.abs(
      Math.PI *
        (worldWidth / measureInfo.scale / 2) *
        (worldHeight / aspect / measureInfo.scale / 2)
    );

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

    // console.debug(projectionPoints)
    for (let i = 0; i < projectionPoints.length; i++) {
      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!imageVolume) {
        continue;
      }

      const centerWorld = projectionPoints[i][0];
      const currentCanvasCoordinates = projectionPoints[i].map((p) =>
        viewport.worldToCanvas(p)
      );

      const [topLeftCanvas, bottomRightCanvas] = <Array<Types.Point2>>(
        getCanvasCircleCorners([
          currentCanvasCoordinates[0],
          currentCanvasCoordinates[1],
        ])
      );

      const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
      const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);

      const worldPos1 = topLeftWorld;
      const worldPos2 = bottomRightWorld;

      const { dimensions, imageData, voxelManager } = imageVolume;

      const worldPos1Index = transformWorldToIndex(imageData, worldPos1);

      const worldProjectionPointIndex = transformWorldToIndex(
        imageData,
        centerWorld
      );

      const indexOfProjection =
        this._getIndexOfCoordinatesForViewplaneNormal(viewPlaneNormal);

      worldPos1Index[0] = Math.floor(worldPos1Index[0]);
      worldPos1Index[1] = Math.floor(worldPos1Index[1]);
      worldPos1Index[2] = Math.floor(worldPos1Index[2]);

      worldPos1Index[indexOfProjection] =
        worldProjectionPointIndex[indexOfProjection];

      const worldPos2Index = transformWorldToIndex(imageData, worldPos2);

      worldPos2Index[0] = Math.floor(worldPos2Index[0]);
      worldPos2Index[1] = Math.floor(worldPos2Index[1]);
      worldPos2Index[2] = Math.floor(worldPos2Index[2]);

      worldPos2Index[indexOfProjection] =
        worldProjectionPointIndex[indexOfProjection];

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      if (
        CircleROITool.isInsideVolume(dimensions, [
          worldPos1Index,
          worldPos2Index,
        ])
      ) {
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

        const pointsInShape = voxelManager.forEach(
          this.configuration.statsCalculator.statsCallback,
          {
            isInObject: (pointLPS) => pointInEllipse(ellipseObj, pointLPS),
            boundsIJK,
            imageData,
            returnPoints: this.configuration.storePointData,
          }
        );
        pointsInsideVolume.push(pointsInShape);
      }
    }
    // console.debug(pointsInsideVolume)
    const stats = this.configuration.statsCalculator.getStatistics();
    data.cachedStats.pointsInVolume = pointsInsideVolume;
    data.cachedStats.statistics = {
      Modality: metadata.Modality,
      area,
      mean: stats.mean?.value,
      stdDev: stats.stdDev?.value,
      max: stats.max?.value,
      statsArray: stats.array,
      areaUnit: measureInfo.areaUnit,
      modalityUnit,
    };
  }

  _calculateCachedStatsTool(annotation, enabledElement) {
    const data = annotation.data;

    const { viewport } = enabledElement;

    const { cachedStats } = data;
    const targetId = this.getTargetId(viewport);
    const imageVolume = cache.getVolume(targetId.split(/volumeId:|\?/)[1]);

    // Todo: this shouldn't be here, this is a performance issue
    // Since we are extending the RectangleROI class, we need to
    // bring the logic for handle to some cachedStats calculation
    this._computeProjectionPoints(annotation, imageVolume);

    this._computePointsInsideVolume(
      annotation,
      imageVolume,
      targetId,
      enabledElement
    );

    annotation.invalidated = false;

    triggerAnnotationModified(annotation, viewport.element);

    return cachedStats;
  }

  _getStartCoordinate(
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

    const startCoord = this._getCoordinateForViewplaneNormal(
      startPos,
      viewPlaneNormal
    );

    return startCoord;
  }

  _getEndCoordinate(
    worldPos: Types.Point3,
    spacingInNormal: number,
    viewPlaneNormal: Types.Point3
  ): number | undefined {
    const numSlicesToPropagate = this.configuration.numSlicesToPropagate;
    const numSlicesToPropagateToEnd =
      numSlicesToPropagate - Math.round(numSlicesToPropagate / 2);

    // get end position by moving from worldPos in the direction of viewplaneNormal
    // with amount of numSlicesToPropagate * spacingInNormal
    const endPos = vec3.create();
    vec3.scaleAndAdd(
      endPos,
      worldPos,
      viewPlaneNormal,
      numSlicesToPropagateToEnd * spacingInNormal
    );

    const endCoord = this._getCoordinateForViewplaneNormal(
      endPos,
      viewPlaneNormal
    );

    return endCoord;
  }

  _getIndexOfCoordinatesForViewplaneNormal(
    viewPlaneNormal: Types.Point3
  ): number {
    const viewplaneNormalAbs = [
      Math.abs(viewPlaneNormal[0]),
      Math.abs(viewPlaneNormal[1]),
      Math.abs(viewPlaneNormal[2]),
    ];
    const indexOfDirection = viewplaneNormalAbs.indexOf(
      Math.max(...viewplaneNormalAbs)
    );

    return indexOfDirection;
  }

  _getCoordinateForViewplaneNormal(
    pos: vec3 | number,
    viewPlaneNormal: Types.Point3
  ): number | undefined {
    const indexOfDirection =
      this._getIndexOfCoordinatesForViewplaneNormal(viewPlaneNormal);
    return pos[indexOfDirection];
  }
}

/**
 * _getTextLines - Returns the Area, mean and std deviation of the area of the
 * target volume enclosed by the rectangle.
 *
 * @param data - The annotation tool-specific data.
 * @param _context - Associated data to annotation.
 */
function defaultGetTextLines(data, _context = {}): string[] {
  const cachedVolumeStats = data.cachedStats.statistics;

  const { area, mean, max, stdDev, areaUnit, modalityUnit } = cachedVolumeStats;

  if (mean === undefined) {
    return;
  }

  const textLines: string[] = [];

  textLines.push(`Area: ${csUtils.roundNumber(area)} ${areaUnit}`);
  textLines.push(`Mean: ${csUtils.roundNumber(mean)} ${modalityUnit}`);
  textLines.push(`Max: ${csUtils.roundNumber(max)} ${modalityUnit}`);
  textLines.push(`Std Dev: ${csUtils.roundNumber(stdDev)} ${modalityUnit}`);

  return textLines;
}

CircleROIStartEndThresholdTool.toolName = 'CircleROIStartEndThreshold';
export default CircleROIStartEndThresholdTool;
