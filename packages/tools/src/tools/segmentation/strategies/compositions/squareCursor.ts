
import { vec3 } from 'gl-matrix';

import type { Types } from '@cornerstonejs/core';

import type { InitializedOperationData } from '../BrushStrategy';
import type {
  SVGDrawingHelper } from '../../../../types'

import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { drawRectByCoordinates as drawRectSvg, drawCircle as drawCircleSvg } from '../../../../drawingSvg';

export default {
  [StrategyCallbacks.CalculateCursorGeometry]: function (
    enabledElement,
    operationData: InitializedOperationData
  ) {
    const { configuration, activeStrategy, hoverData } = operationData;
    const { viewport } = enabledElement;

    const { canvasToWorld } = viewport;
    const camera = viewport.getCamera();
    const { brushSize } = configuration;

    const viewUp = vec3.fromValues(
      camera.viewUp[0],
      camera.viewUp[1],
      camera.viewUp[2]
    );
    const viewPlaneNormal = vec3.fromValues(
      camera.viewPlaneNormal[0],
      camera.viewPlaneNormal[1],
      camera.viewPlaneNormal[2]
    );
    const viewUpLength = vec3.length(viewUp);
    const viewPlaneNormalLength = vec3.length(viewPlaneNormal);

    if (viewUpLength === 0 || viewPlaneNormalLength === 0) {
      return;
    }

    vec3.scale(viewUp, viewUp, 1 / viewUpLength);
    vec3.scale(viewPlaneNormal, viewPlaneNormal, 1 / viewPlaneNormalLength);

    const viewRight = vec3.create();
    vec3.cross(viewRight, viewUp, viewPlaneNormal);

    const viewRightLength = vec3.length(viewRight);

    if (viewRightLength === 0) {
      return;
    }

    vec3.scale(viewRight, viewRight, 1 / viewRightLength);


    const { centerCanvas } = hoverData;
    // in the world coordinate system, the brushSize is the radius of the circle
    // in mm
    const centerCursorInWorld: Types.Point3 = canvasToWorld([
      centerCanvas[0],
      centerCanvas[1],
    ]);

    const topOffset = vec3.create();
    const bottomOffset = vec3.create();
    const rightOffset = vec3.create();
    const leftOffset = vec3.create();

    vec3.scale(topOffset, viewUp, brushSize);
    vec3.scale(bottomOffset, viewUp, -brushSize);
    vec3.scale(rightOffset, viewRight, brushSize);
    vec3.scale(leftOffset, viewRight, -brushSize);

    const bottomCursorInWorld = vec3.create();
    const topCursorInWorld = vec3.create();
    const leftCursorInWorld = vec3.create();
    const rightCursorInWorld = vec3.create();

    for (let i = 0; i <= 2; i++) {
      bottomCursorInWorld[i] = centerCursorInWorld[i] + bottomOffset[i];
      topCursorInWorld[i] = centerCursorInWorld[i] + topOffset[i];
      leftCursorInWorld[i] = centerCursorInWorld[i] + leftOffset[i];
      rightCursorInWorld[i] = centerCursorInWorld[i] + rightOffset[i];
    }

    const topLeftCursorInWorld = vec3.create();
    const topRightCursorInWorld = vec3.create();
    const bottomLeftCursorInWorld = vec3.create();
    const bottomRightCursorInWorld = vec3.create();

    vec3.add(topLeftCursorInWorld, centerCursorInWorld, topOffset);
    vec3.add(topLeftCursorInWorld, topLeftCursorInWorld, leftOffset);

    vec3.add(topRightCursorInWorld, centerCursorInWorld, topOffset);
    vec3.add(topRightCursorInWorld, topRightCursorInWorld, rightOffset);

    vec3.add(bottomLeftCursorInWorld, centerCursorInWorld, bottomOffset);
    vec3.add(bottomLeftCursorInWorld, bottomLeftCursorInWorld, leftOffset);

    vec3.add(bottomRightCursorInWorld, centerCursorInWorld, bottomOffset);
    vec3.add(bottomRightCursorInWorld, bottomRightCursorInWorld, rightOffset);

    if (!hoverData) {
      return;
    }

    const { brushCursor } = hoverData;
    const { data } = brushCursor;

    if (data.handles === undefined) {
      data.handles = {};
    }

    data.handles.points = [
      bottomCursorInWorld,
      topCursorInWorld,
      leftCursorInWorld,
      rightCursorInWorld,
    ];
    data.handles.squareCornersWorld = [
      topLeftCursorInWorld,
      topRightCursorInWorld,
      bottomLeftCursorInWorld,
      bottomRightCursorInWorld,
    ];

    const strategy = configuration.strategies[activeStrategy];

    // Note: i don't think this is the best way to implement this
    // but don't think we have a better way to do it for now
    if (typeof strategy?.computeInnerCircleRadius === 'function') {
      strategy.computeInnerCircleRadius({
        configuration: configuration,
        viewport,
      });
    }

    data.invalidated = false;
  },
  [StrategyCallbacks.RenderCursor]: function (
    enabledElement,
    operationData: InitializedOperationData,
    svgDrawingHelper: SVGDrawingHelper
  ) {
    const { configuration, hoverData } = operationData;
    const { viewport } = enabledElement;
    const { brushCursor } = hoverData;

    const toolMetadata = brushCursor.metadata;
    if (!toolMetadata) {
      return;
    }

    const annotationUID = toolMetadata.brushCursorUID;

    const data = brushCursor.data;
    const { points, squareCornersWorld } = data.handles;
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

    if (canvasCoordinates.length < 4) {
      return;
    }

    const squareCorners =
      Array.isArray(squareCornersWorld) && squareCornersWorld.length === 4
        ? squareCornersWorld
        : this._createSquareCornersFromHandles(points);

    const squareCanvasCoordinates = squareCorners.map((p) =>
      viewport.worldToCanvas(p)
    ) as [Types.Point2, Types.Point2, Types.Point2, Types.Point2];

    const [topLeft, topRight, bottomLeft, bottomRight] =
      squareCanvasCoordinates;

    const [bottom, top] = canvasCoordinates as [Types.Point2, Types.Point2];

    const center = [
      Math.floor((bottom[0] + top[0]) / 2),
      Math.floor((bottom[1] + top[1]) / 2),
    ];

    const color = `rgb(${toolMetadata.segmentColor?.slice(0, 3) || [0, 0, 0]})`;

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return;
    }

    const squareUID = '0';
    const cursorLineDash =
      this.centerSegmentIndexInfo.segmentIndex === 0 ? [1, 2] : undefined;

    drawRectSvg(
      svgDrawingHelper,
      annotationUID,
      squareUID,
      [topLeft, topRight, bottomLeft, bottomRight],
      {
        color,
        lineDash: cursorLineDash,
      }
    );

    const { dynamicRadiusInCanvas } = configuration?.threshold || {
      dynamicRadiusInCanvas: 0,
    };

    if (dynamicRadiusInCanvas) {
      const circleUID1 = '1';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID1,
        center as Types.Point2,
        dynamicRadiusInCanvas,
        {
          color,
        }
      );
    }
  }
}
