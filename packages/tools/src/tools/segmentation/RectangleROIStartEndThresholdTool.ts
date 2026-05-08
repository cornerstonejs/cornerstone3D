import {
  getEnabledElement,
  cache,
  StackViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getCalibratedLengthUnitsAndScale } from '../../utilities/getCalibratedUnits';
import { vec3 } from 'gl-matrix';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import throttle from '../../utilities/throttle';
import debounce from '../../utilities/debounce';
import getWorldWidthAndHeightFromCorners from '../../utilities/planar/getWorldWidthAndHeightFromCorners';

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
} from '../../types';
import type {
  RectangleROIStartEndThresholdAnnotation,
  ROICachedStats,
} from '../../types/ToolSpecificAnnotationTypes';
import RectangleROITool from '../annotation/RectangleROITool';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';
import { BasicStatsCalculator } from '../../utilities/math/basic';
import { filterAnnotationsWithinSamePlane } from '../../utilities/planar';
import { getPixelValueUnits } from '../../utilities/getPixelValueUnits';

const { transformWorldToIndex } = csUtils;

/**
 * This tool is similar to the RectangleROIThresholdTool which
 * only draws a rectangle on the image, and by using utility functions
 * such as thresholdByRange and thresholdByROIStat it can be used to
 * create a segmentation. The only difference is that it only acts on the
 * acquisition plane and not the 3D volume, and accepts a start and end
 * slice, and renders a dashed rectangle on the image between the start and end
 * but a solid rectangle on start and end slice. Utility functions should be used
 * to modify the start and end slice.
 * // Todo: right now only the first slice has grabbable handles, need to make
 * // it so that the handles are grabbable on all slices.
 */
class RectangleROIStartEndThresholdTool extends RectangleROITool {
  static toolName;
  _throttledCalculateCachedStats: Function;
  editData: {
    annotation: Annotation;
    viewportIdsToRender: string[];
    handleIndex?: number;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {
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
   * Based on the current position of the mouse and the enabledElement it creates
   * the edit data for the tool.
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

    const startCoord = this._getStartCoordinate(worldPos, viewPlaneNormal);

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
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
        toolName: this.getToolName(),
        volumeId,
        spacingInNormal,
      },
      data: {
        label: '',
        startCoordinate: startCoord,
        endCoordinate: endCoord,
        cachedStats: {
          pointsInVolume: [],
          projectionPoints: [],
          projectionPointsImageIds: [referencedImageId],
          statistics: [] as unknown as ROICachedStats,
        },
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
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
          activeHandleIndex: null,
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
      handleIndex: 3,
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
      targetId,
      imageVolume,
      enabledElement
    );

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    } else {
      triggerAnnotationModified(annotation, element);
    }
  };

  //Now works for axial, sagitall and coronal
  _computeProjectionPoints(
    annotation: RectangleROIStartEndThresholdAnnotation,
    imageVolume: Types.IImageVolume
  ): void {
    const { data, metadata } = annotation;
    const { viewPlaneNormal, spacingInNormal } = metadata;
    const { imageData } = imageVolume;
    const { startCoordinate, endCoordinate } = data;
    const { points } = data.handles;

    const startIJK = transformWorldToIndex(imageData, points[0]);
    const endIJK = transformWorldToIndex(imageData, points[0]);

    const startWorld = vec3.create();
    imageData.indexToWorldVec3(startIJK, startWorld);

    const endWorld = vec3.create();
    imageData.indexToWorldVec3(endIJK, endWorld);

    const projectionAxisIndex =
      this._getIndexOfCoordinatesForViewplaneNormal(viewPlaneNormal);

    if (projectionAxisIndex == 2) {
      startWorld[2] = startCoordinate;
      endWorld[2] = endCoordinate;
    } else if (projectionAxisIndex == 0) {
      startWorld[0] = startCoordinate;
      endWorld[0] = endCoordinate;
    } else if (projectionAxisIndex == 1) {
      startWorld[1] = startCoordinate;
      endWorld[1] = endCoordinate;
    }

    // Calculate the explicit direction vector from start to end
    const direction = vec3.create();
    vec3.subtract(direction, endWorld, startWorld);

    const distance = vec3.length(direction);

    // Normalize the direction vector to get a unit vector for scaling.
    vec3.normalize(direction, direction);

    const newProjectionPoints = [];

    for (let dist = 0; dist < distance; dist += spacingInNormal) {
      newProjectionPoints.push(
        points.map((point) => {
          const newPoint = vec3.create();
          vec3.scaleAndAdd(newPoint, point, direction, dist);
          return Array.from(newPoint);
        })
      );
    }

    data.cachedStats.projectionPoints = newProjectionPoints;
  }

  //This function return all the points inside the ROI and calculate statistics for every slices between startCoordinate and endCoordinate
  _computePointsInsideVolume(
    annotation,
    targetId,
    imageVolume,
    enabledElement
  ) {
    const { data, metadata } = annotation;
    const { viewPlaneNormal, viewUp } = metadata;
    const { viewport } = enabledElement;

    const projectionPoints = data.cachedStats.projectionPoints;

    const pointsInsideVolume: Types.Point3[][] = [[]];
    const image = this.getTargetImageData(targetId);

    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[3];

    const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
      viewPlaneNormal,
      viewUp,
      worldPos1,
      worldPos2
    );
    const measureInfo = getCalibratedLengthUnitsAndScale(image, data.habdles);

    const area =
      Math.abs(worldWidth * worldHeight) /
      (measureInfo.scale * measureInfo.scale);

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

    for (let i = 0; i < projectionPoints.length; i++) {
      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!imageVolume) {
        continue;
      }

      const projectionPoint = projectionPoints[i][0];

      const { dimensions, imageData, voxelManager } = imageVolume;

      const worldPos1Index = transformWorldToIndex(imageData, worldPos1);
      //We only need to change the Z of our bounds so we are getting the Z from the current projection point
      const worldProjectionPointIndex = transformWorldToIndex(
        imageData,
        projectionPoint
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
        this.isHandleOutsideImage = false;
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

        const pointsInShape = voxelManager.forEach(
          this.configuration.statsCalculator.statsCallback,
          {
            boundsIJK,
            imageData,
            returnPoints: this.configuration.storePointData,
          }
        );

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
      targetId,
      imageVolume,
      enabledElement
    );

    annotation.invalidated = false;

    // Dispatching annotation modified
    triggerAnnotationModified(annotation, viewport.element);

    return cachedStats;
  }

  /**
   * it is used to draw the rectangleROIStartEnd annotation in each
   * request animation frame.
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
      const annotation = annotations[
        i
      ] as RectangleROIStartEndThresholdAnnotation;
      const { annotationUID, data, metadata } = annotation;
      const { startCoordinate, endCoordinate } = data;
      const { points, activeHandleIndex } = data.handles;
      const { enabledElement: annotationEnabledElement } = metadata;

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);
      const focalPoint = viewport.getCamera().focalPoint;
      const viewplaneNormal = viewport.getCamera().viewPlaneNormal;

      let startCoord: number | vec3 = startCoordinate;
      let endCoord: number | vec3 = endCoordinate;

      if (Array.isArray(startCoordinate)) {
        startCoord = this._getCoordinateForViewplaneNormal(
          startCoord,
          viewplaneNormal
        );
        const indexOfDirection =
          this._getIndexOfCoordinatesForViewplaneNormal(viewplaneNormal);

        data.handles.points.forEach((point) => {
          point[indexOfDirection] = startCoord as number;
        });

        data.startCoordinate = startCoord;
      }

      if (Array.isArray(endCoordinate)) {
        endCoord = this._getCoordinateForViewplaneNormal(
          endCoord,
          viewplaneNormal
        );
        data.endCoordinate = endCoord;
        data.endCoordinate = endCoord;
      }

      const roundedStartCoord = csUtils.roundToPrecision(startCoord);
      const roundedEndCoord = csUtils.roundToPrecision(endCoord);

      const coord = this._getCoordinateForViewplaneNormal(
        focalPoint,
        viewplaneNormal
      );
      const roundedCoord = csUtils.roundToPrecision(coord);
      // if the focalpoint is outside the start/end coordinates, we don't render
      if (
        roundedCoord < Math.min(roundedStartCoord, roundedEndCoord) ||
        roundedCoord > Math.max(roundedStartCoord, roundedEndCoord)
      ) {
        continue;
      }

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

      // if it is inside the start/end slice, but not exactly the first or
      // last slice, we render the line in dash, but not the handles
      let firstOrLastSlice = false;
      if (
        roundedCoord === roundedStartCoord ||
        roundedCoord === roundedEndCoord
      ) {
        firstOrLastSlice = true;
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
        firstOrLastSlice
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

      let lineDashToUse = lineDash;

      if (!firstOrLastSlice) {
        lineDashToUse = 2;
      }

      const rectangleUID = '0';
      drawRectSvg(
        svgDrawingHelper,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash: lineDashToUse,
          lineWidth,
        }
      );

      renderStatus = true;

      if (this.configuration.showTextBox) {
        const textLines = this.configuration.getTextLines(data, { metadata });
        if (!textLines || textLines.length === 0) {
          continue;
        }
        if (
          !this.renderLinkedTextBoxAnnotation({
            enabledElement,
            svgDrawingHelper,
            annotation,
            styleSpecifier,
            textLines,
            canvasCoordinates,
          })
        ) {
          continue;
        }
      }
    }

    return renderStatus;
  };

  _getStartCoordinate(
    worldPos: Types.Point3,
    viewPlaneNormal: Types.Point3
  ): number | undefined {
    const startPos = worldPos;
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

    // get end position by moving from worldPos in the direction of viewplaneNormal
    // with amount of numSlicesToPropagate * spacingInNormal
    const endPos = vec3.create();
    vec3.scaleAndAdd(
      endPos,
      worldPos,
      viewPlaneNormal,
      numSlicesToPropagate * spacingInNormal
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

RectangleROIStartEndThresholdTool.toolName = 'RectangleROIStartEndThreshold';
export default RectangleROIStartEndThresholdTool;
