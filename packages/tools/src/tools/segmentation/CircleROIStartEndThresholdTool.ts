import {
  StackViewport,
  Types,
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
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import getWorldWidthAndHeightFromTwoPoints from '../../utilities/planar/getWorldWidthAndHeightFromTwoPoints';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import throttle from '../../utilities/throttle';
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
import {
  getCalibratedLengthUnitsAndScale,
  getCalibratedAspect,
} from '../../utilities/getCalibratedUnits';
import { getModalityUnit } from '../../utilities/getModalityUnit';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';
import { pointInEllipse } from '../../utilities/math/ellipse';
import { pointInShapeCallback, roundNumber } from '../../utilities';
import { BasicStatsCalculator } from '../../utilities/math/basic';

import cloneDeep from 'lodash.clonedeep';
import { filterAnnotationsWithinSamePlane } from '../../utilities/planar';

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
        getTextLines: defaultGetTextLines,
        statsCalculator: BasicStatsCalculator,
        showTextBox: false,
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
          points: [[...worldPos], [...worldPos]] as [
            Types.Point3, // center
            Types.Point3 // end
          ],
          activeHandleIndex: null,
        },
        cachedStats: {
          pointsInVolume: [],
          projectionPoints: [],
          statistics: [],
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
      this._computePointsInsideVolume(
        annotation,
        imageVolume,
        targetId,
        enabledElement
      );
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
      const { annotationUID, data } = annotation;
      const { startCoordinate, endCoordinate } = data;
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
      const canvasCorners = getCanvasCircleCorners(canvasCoordinates);
      // range of slices to render based on the start and end slice, like
      // np.arange

      const focalPoint = viewport.getCamera().focalPoint;
      const viewplaneNormal = viewport.getCamera().viewPlaneNormal;

      let startCoord: number | vec3 = startCoordinate;
      let endCoord: number | vec3 = endCoordinate;
      if (Array.isArray(startCoordinate)) {
        startCoord = this._getCoordinateForViewplaneNormal(
          startCoord,
          viewplaneNormal
        );
      }
      if (Array.isArray(endCoordinate)) {
        endCoord = this._getCoordinateForViewplaneNormal(
          endCoord,
          viewplaneNormal
        );
      }

      const roundedStartCoord = coreUtils.roundToPrecision(startCoord);
      const roundedEndCoord = coreUtils.roundToPrecision(endCoord);

      const coord = this._getCoordinateForViewplaneNormal(
        focalPoint,
        viewplaneNormal
      );
      const roundedCoord = coreUtils.roundToPrecision(coord);

      // if the focalpoint is outside the start/end coordinates, we don't render
      if (
        roundedCoord < Math.min(roundedStartCoord, roundedEndCoord) ||
        roundedCoord > Math.max(roundedStartCoord, roundedEndCoord)
      ) {
        continue;
      }
      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT

      if (annotation.invalidated) {
        this._throttledCalculateCachedStats(annotation, enabledElement);
      }

      const middleCoord = coreUtils.roundToPrecision(
        (startCoord + endCoord) / 2
      );
      // if it is inside the start/end slice, but not exactly the first or
      // last slice, we render the line in dash, but not the handles

      let isMiddleSlice = false;
      if (roundedCoord === middleCoord) {
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

      if (
        this.configuration.showTextBox == true &&
        this.configuration.calculatePointsInsideVolume == true
      ) {
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
        const textLines = this.configuration.getTextLines(data);
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
    }
    return renderStatus;
  };

  //Now works for axial, sagitall and coronal
  _computeProjectionPoints(
    annotation: CircleROIStartEndThresholdAnnotation,
    imageVolume: Types.IImageVolume
  ): void {
    const { data, metadata } = annotation;
    const { viewPlaneNormal, spacingInNormal } = metadata;
    const { imageData } = imageVolume;
    const { startCoordinate, endCoordinate } = data;
    const { points } = data.handles;

    const startIJK = transformWorldToIndex(imageData, points[0]);
    const endIJK = transformWorldToIndex(imageData, points[0]);

    const handlesToStart = cloneDeep(points);

    const startWorld = vec3.create();
    imageData.indexToWorldVec3(startIJK, startWorld);

    const endWorld = vec3.create();
    imageData.indexToWorldVec3(endIJK, endWorld);

    // substitute the end slice index 2 with startIJK index 2

    if (this._getIndexOfCoordinatesForViewplaneNormal(viewPlaneNormal) == 2) {
      startWorld[2] = startCoordinate;
      endWorld[2] = endCoordinate;
      handlesToStart[0][2] = startCoordinate;
      handlesToStart[1][2] = startCoordinate;
    } else if (
      this._getIndexOfCoordinatesForViewplaneNormal(viewPlaneNormal) == 0
    ) {
      startWorld[0] = startCoordinate;
      endWorld[0] = endCoordinate;
      handlesToStart[0][0] = startCoordinate;
      handlesToStart[1][0] = startCoordinate;
    } else if (
      this._getIndexOfCoordinatesForViewplaneNormal(viewPlaneNormal) == 1
    ) {
      startWorld[1] = startCoordinate;
      endWorld[1] = endCoordinate;
      handlesToStart[0][1] = startCoordinate;
      handlesToStart[1][1] = startCoordinate;
    }

    // distance between start and end slice in the world coordinate
    const distance = vec3.distance(startWorld, endWorld);

    // for each point inside points, navigate in the direction of the viewPlaneNormal
    // with amount of spacingInNormal, and calculate the next slice until we reach the distance
    const newProjectionPoints = [];
    for (let dist = 0; dist < distance; dist += spacingInNormal) {
      newProjectionPoints.push(
        handlesToStart.map((point) => {
          const newPoint = vec3.create();
          //@ts-ignore
          vec3.scaleAndAdd(newPoint, point, viewPlaneNormal, dist);
          return Array.from(newPoint);
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
    const { viewport, renderingEngine } = enabledElement;
    const projectionPoints = data.cachedStats.projectionPoints;

    const pointsInsideVolume: Types.Point3[][] = [[]];

    const image = this.getTargetIdImage(targetId, renderingEngine);

    const canvasCoordinates = data.handles.points.map((p) =>
      viewport.worldToCanvas(p)
    );
    const [topLeftCanvas, bottomRightCanvas] = <Array<Types.Point2>>(
      getCanvasCircleCorners(canvasCoordinates)
    );
    const pos1 = viewport.canvasToWorld(topLeftCanvas);
    const pos2 = viewport.canvasToWorld(bottomRightCanvas);

    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
      viewPlaneNormal,
      viewUp,
      pos1,
      pos2
    );
    const measureInfo = getCalibratedLengthUnitsAndScale(image, data.handles);
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

    const modalityUnit = getModalityUnit(
      metadata.Modality,
      annotation.metadata.referencedImageId,
      modalityUnitOptions
    );

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
          this.configuration.statsCalculator.statsCallback,
          boundsIJK
        );

        //@ts-ignore
        pointsInsideVolume.push(pointsInShape);
      }
    }
    const stats = this.configuration.statsCalculator.getStatistics();
    data.cachedStats.pointsInVolume = pointsInsideVolume;
    data.cachedStats.statistics = {
      Modality: metadata.Modality,
      area,
      mean: stats.mean?.value,
      stdDev: stats.stdDev?.value,
      max: stats.max?.value,
      statsArray: stats.array,
      areaUnit: measureInfo.areaUnits,
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
 * @param targetId - The volumeId of the volume to display the stats for.
 */
function defaultGetTextLines(data): string[] {
  const cachedVolumeStats = data.cachedStats.statistics;

  const { area, mean, max, stdDev, areaUnit, modalityUnit } = cachedVolumeStats;

  if (mean === undefined) {
    return;
  }

  const textLines: string[] = [];

  textLines.push(`Area: ${roundNumber(area)} ${areaUnit}`);
  textLines.push(`Mean: ${roundNumber(mean)} ${modalityUnit}`);
  textLines.push(`Max: ${roundNumber(max)} ${modalityUnit}`);
  textLines.push(`Std Dev: ${roundNumber(stdDev)} ${modalityUnit}`);

  return textLines;
}

CircleROIStartEndThresholdTool.toolName = 'CircleROIStartEndThreshold';
export default CircleROIStartEndThresholdTool;
