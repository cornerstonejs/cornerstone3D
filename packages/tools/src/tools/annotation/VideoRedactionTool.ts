import { AnnotationTool } from '../base';

import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
  VideoViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement';
import {
  drawHandles as drawHandlesSvg,
  drawRedactionRect as drawRedactionRectSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { Events } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import * as rectangle from '../../utilities/math/rectangle';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import { SVGDrawingHelper } from '../../types';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { vec3, vec2 } from 'gl-matrix';

// interface VideoRedactionSpecificToolData extends ToolSpecificToolData {
//   data: {
//     invalidated: boolean;
//     handles: {
//       points: Types.Point3[];
//       activeHandleIndex: number | null;
//       textBox: {
//         hasMoved: boolean;
//         worldPosition: Types.Point3;
//         worldBoundingBox: {
//           topLeft: Types.Point3;
//           topRight: Types.Point3;
//           bottomLeft: Types.Point3;
//           bottomRight: Types.Point3;
//         };
//       };
//     };
//     cachedStats: any;
//     active: boolean;
//   };
// }

class VideoRedactionTool extends AnnotationTool {
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportUIDsToRender: string[];
    handleIndex?: number;
    movingTextBox: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  _configuration: any;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: { shadow: true, preventHandleOutsideImage: false },
    });

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  // TODO_JAMES -> We are just adding this as a "global redaction for now".
  // I.e. annotation tied to entire video, rather than a frame or a particular time
  // Range, which would also be possible.
  addNewAnnotation = (evt: CustomEvent) => {
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const annotation = {
      metadata: {
        // We probably just want a different type of data here, hacking this
        // together for now.
        viewPlaneNormal: <Types.Point3>[0, 0, 1],
        viewUp: <Types.Point3>[0, 1, 0],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: viewport.getFrameOfReferenceUID(),
        toolName: this.getToolName(),
      },
      data: {
        invalidated: true,
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
        active: true,
      },
    };

    addAnnotation(annotation, element);

    const viewportUIDsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      false // TODO_JAMES: Just trying to bypass the vtk specific stuff as fast as possible.
    );

    this.editData = {
      annotation,
      viewportUIDsToRender,
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      viewportUIDsToRender
    );

    return annotation;
  };

  getHandleNearImagePoint = (element, annotation, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const { points, textBox } = data.handles;
    const { worldBoundingBox } = textBox;

    if (worldBoundingBox) {
      // If the bounding box for the textbox exists, see if we are clicking within it.
      const canvasBoundingBox = {
        topLeft: viewport.worldToCanvas(worldBoundingBox.topLeft),
        topRight: viewport.worldToCanvas(worldBoundingBox.topRight),
        bottomLeft: viewport.worldToCanvas(worldBoundingBox.bottomLeft),
        bottmRight: viewport.worldToCanvas(worldBoundingBox.bottomRight),
      };

      if (
        canvasCoords[0] >= canvasBoundingBox.topLeft[0] &&
        canvasCoords[0] <= canvasBoundingBox.bottmRight[0] &&
        canvasCoords[1] >= canvasBoundingBox.topLeft[1] &&
        canvasCoords[1] <= canvasBoundingBox.bottmRight[1]
      ) {
        data.handles.activeHandleIndex = null;
        return textBox;
      }
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const toolDataCanvasCoordinate = viewport.worldToCanvas(point);

      const near =
        vec2.distance(canvasCoords, <vec2>toolDataCanvasCoordinate) < proximity;

      if (near === true) {
        data.handles.activeHandleIndex = i;
        return point;
      }
    }

    data.handles.activeHandleIndex = null;
  };

  isPointNearTool = (element, annotation, canvasCoords, proximity) => {
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

    const point = [canvasCoords[0], canvasCoords[1]] as Types.Point2;
    const { left, top, width, height } = rect;

    const distanceToPoint = rectangle.distanceToPoint(
      [left, top, width, height],
      point
    );

    if (distanceToPoint <= proximity) {
      return true;
    }
  };

  toolSelectedCallback = (evt, annotation, interactionType = 'mouse') => {
    const eventData = evt.detail;
    const { element } = eventData;

    const { data } = annotation;

    data.active = true;

    const viewportUIDsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      false // TODO_JAMES: Just trying to bypass the vtk specific stuff as fast as possible.
    );

    this.editData = {
      annotation,
      viewportUIDsToRender,
      movingTextBox: false,
    };

    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      viewportUIDsToRender
    );

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt,
    annotation,
    handle,
    interactionType = 'mouse'
  ) => {
    const eventData = evt.detail;
    const { element } = eventData;
    const { data } = annotation;

    data.active = true;

    let movingTextBox = false;
    let handleIndex;

    if (handle.worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle);
    }

    // Find viewports to render on drag.
    const viewportUIDsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      false // TODO_JAMES: Just trying to bypass the vtk specific stuff as fast as possible.
    );

    this.editData = {
      annotation,
      viewportUIDsToRender,
      handleIndex,
      movingTextBox,
    };
    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      viewportUIDsToRender
    );

    evt.preventDefault();
  };

  _mouseUpCallback = (evt) => {
    const eventData = evt.detail;
    const { element } = eventData;

    const { annotation, viewportUIDsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      return;
    }

    data.active = false;
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
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      viewportUIDsToRender
    );
  };

  _mouseDragCallback = (evt) => {
    this.isDrawing = true;

    const eventData = evt.detail;
    const { element } = eventData;

    const { annotation, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData;
    const { data } = annotation;

    if (movingTextBox) {
      // Move the text boxes world position
      const { deltaPoints } = eventData;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Moving tool, so move all points by the world points delta
      const { deltaPoints } = eventData;
      const worldPosDelta = deltaPoints.world;

      const { points } = data.handles;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      data.invalidated = true;
    } else {
      // Moving handle.
      const { currentPoints } = eventData;
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
      data.invalidated = true;
    }

    this.editData.hasMoved = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      viewportUIDsToRender
    );
  };

  cancel(element) {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportUIDsToRender } = this.editData;

      const { data } = annotation;

      data.active = false;
      data.handles.activeHandleIndex = null;

      const enabledElement = getEnabledElement(element);
      const { renderingEngine } = enabledElement;

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportUIDsToRender
      );

      this.editData = null;
      return annotation.metadata.annotationUID;
    }
  }
  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._mouseDragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    element.addEventListener(Events.TOUCH_END, this._mouseUpCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._mouseDragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    element.addEventListener(Events.TOUCH_END, this._mouseUpCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback);
  };

  /**
   * Remove event handlers for the modify event loop, and enable default event propagation.
   */
  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback);
  };

  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    const renderStatus = false;
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
      const annotation = annotations[i];
      const { annotationUID } = annotation;
      const toolMetadata = annotation.metadata;

      const data = annotation.data;
      const { points, activeHandleIndex } = data.handles;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);
      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return;
      }

      let activeHandleCanvasCoords;

      if (
        // !isToolDataLocked(toolData) &&
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

      const rectangleUID = '0';
      drawRedactionRectSvg(
        svgDrawingHelper,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash,
          lineWidth,
        }
      );
    }
  };

  /**
   * _findTextBoxAnchorPoints - Finds the middle points of each rectangle side
   * to attach the linked textbox to.
   *
   * @param {} points - An array of points.
   */
  _findTextBoxAnchorPoints = (
    points: Array<Types.Point2>
  ): Array<Types.Point2> => {
    const { left, top, width, height } =
      this._getRectangleImageCoordinates(points);

    return [
      [
        // Top middle point of rectangle
        left + width / 2,
        top,
      ],
      [
        // Left middle point of rectangle
        left,
        top + height / 2,
      ],
      [
        // Bottom middle point of rectangle
        left + width / 2,
        top + height,
      ],
      [
        // Right middle point of rectangle
        left + width,
        top + height / 2,
      ],
    ];
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
   * @param {object} data - The toolDatas tool-specific data.
   * @param {string} targetUID - The volumeUID of the volume to display the stats for.
   */
  _getTextLines = (data, targetUID: string) => {
    const cachedVolumeStats = data.cachedStats[targetUID];
    const { area, mean, stdDev, Modality } = cachedVolumeStats;

    if (mean === undefined) {
      return;
    }

    const textLines = [];

    const areaLine = `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`;
    let meanLine = `Mean: ${mean.toFixed(2)}`;
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`;

    // Give appropriate units for the modality.
    if (Modality === 'PT') {
      meanLine += ' SUV';
      stdDevLine += ' SUV';
    } else if (Modality === 'CT') {
      meanLine += ' HU';
      stdDevLine += ' HU';
    } else {
      meanLine += ' MO';
      stdDevLine += ' MO';
    }

    textLines.push(areaLine);
    textLines.push(meanLine);
    textLines.push(stdDevLine);

    return textLines;
  };

  _getImageVolumeFromTargetUID(targetUID, renderingEngine) {
    let imageVolume, viewport;
    if (targetUID.startsWith('stackTarget')) {
      const coloneIndex = targetUID.indexOf(':');
      const viewportUID = targetUID.substring(coloneIndex + 1);
      const viewport = renderingEngine.getViewport(viewportUID);
      imageVolume = viewport.getImageData();
    } else {
      imageVolume = getVolume(targetUID);
    }

    return { imageVolume, viewport };
  }

  /**
   * _calculateCachedStats - For each volume in the frame of reference that a
   * tool instance in particular viewport defines as its target volume, find the
   * volume coordinates (i,j,k) being probed by the two corners. One of i,j or k
   * will be constant across the two points. In the other two directions iterate
   * over the voxels and calculate the first and second-order statistics.
   *
   * @param {object} data - The toolData tool-specific data.
   * @param {Array<number>} viewPlaneNormal The normal vector of the camera.
   * @param {Array<number>} viewUp The viewUp vector of the camera.
   */
  _calculateCachedStats = (
    annotation,
    viewPlaneNormal,
    viewUp,
    renderingEngine,
    enabledElement
  ) => {
    const { data } = annotation;
    const { viewportUID, renderingEngineUID, sceneUID } = enabledElement;

    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[3];
    const { cachedStats } = data;

    const targetUIDs = Object.keys(cachedStats);

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i];

      const { imageVolume } = this._getImageVolumeFromTargetUID(
        targetUID,
        renderingEngine
      );

      const {
        dimensions,
        scalarData,
        vtkImageData: imageData,
        metadata,
        direction,
      } = imageVolume;
      const worldPos1Index = vec3.fromValues(0, 0, 0);
      const worldPos2Index = vec3.fromValues(0, 0, 0);

      imageData.worldToIndexVec3(worldPos1, worldPos1Index);

      worldPos1Index[0] = Math.floor(worldPos1Index[0]);
      worldPos1Index[1] = Math.floor(worldPos1Index[1]);
      worldPos1Index[2] = Math.floor(worldPos1Index[2]);

      imageData.worldToIndexVec3(worldPos2, worldPos2Index);

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

        const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
          viewPlaneNormal,
          viewUp,
          worldPos1,
          worldPos2
        );

        const area = worldWidth * worldHeight;

        let count = 0;
        let mean = 0;
        let stdDev = 0;

        const yMultiple = dimensions[0];
        const zMultiple = dimensions[0] * dimensions[1];

        // This is a triple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i];

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

        cachedStats[targetUID] = {
          Modality: metadata.Modality,
          area,
          mean,
          stdDev,
        };
      } else {
        this.isHandleOutsideImage = true;
        cachedStats[targetUID] = {
          Modality: metadata.Modality,
        };
      }
    }

    data.invalidated = false;

    // Dispatching measurement modified
    const eventType = Events.ANNOTATION_MODIFIED;

    const eventDetail = {
      annotation,
      viewportUID,
      renderingEngineUID,
      sceneUID: sceneUID,
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

  _getTargetStackUID(viewport) {
    return `stackTarget:${viewport.uid}`;
  }

  _getTargetVolumeUID = (scene) => {
    if (this.configuration.volumeUID) {
      return this.configuration.volumeUID;
    }

    const volumeActors = scene.getVolumeActors();

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return;
    }

    return volumeActors[0].uid;
  };
}

VideoRedactionTool.toolName = 'VideoRedaction';
export default VideoRedactionTool;
