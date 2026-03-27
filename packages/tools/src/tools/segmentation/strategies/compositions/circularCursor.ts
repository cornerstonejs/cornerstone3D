import { vec3 } from 'gl-matrix';

import type { Types } from '@cornerstonejs/core';

import type { InitializedOperationData } from '../BrushStrategy';
import type { SVGDrawingHelper } from '../../../../types';

import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import {
  drawCircle as drawCircleSvg,
  drawPath as drawPathSvg,
} from '../../../../drawingSvg';

export default {
  [StrategyCallbacks.CalculateCursorGeometry]: function (
    enabledElement,
    operationData: InitializedOperationData
  ) {
    if (!operationData) {
      return;
    }
    const { configuration, activeStrategy, hoverData } = operationData;
    const { viewport } = enabledElement;

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
    const viewRight = vec3.create();

    vec3.cross(viewRight, viewUp, viewPlaneNormal);

    const { canvasToWorld } = viewport;
    const { centerCanvas } = hoverData;

    // in the world coordinate system, the brushSize is the radius of the circle
    // in mm
    const centerCursorInWorld: Types.Point3 = canvasToWorld([
      centerCanvas[0],
      centerCanvas[1],
    ]);

    const bottomCursorInWorld = vec3.create();
    const topCursorInWorld = vec3.create();
    const leftCursorInWorld = vec3.create();
    const rightCursorInWorld = vec3.create();

    // Calculate the bottom and top points of the circle in world coordinates
    for (let i = 0; i <= 2; i++) {
      bottomCursorInWorld[i] = centerCursorInWorld[i] - viewUp[i] * brushSize;
      topCursorInWorld[i] = centerCursorInWorld[i] + viewUp[i] * brushSize;
      leftCursorInWorld[i] = centerCursorInWorld[i] - viewRight[i] * brushSize;
      rightCursorInWorld[i] = centerCursorInWorld[i] + viewRight[i] * brushSize;
    }

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
    data.editPoints = [...data.handles.points];

    const strategy = configuration.strategies[activeStrategy];

    // Note: i don't think this is the best way to implement this
    // but don't think we have a better way to do it for now
    if (typeof strategy?.computeInnerCircleRadius === 'function') {
      strategy.computeInnerCircleRadius({
        configuration,
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
    if (!operationData) {
      return;
    }

    const { configuration, hoverData } = operationData;
    const { viewport } = enabledElement;
    const { brushCursor } = hoverData;

    const toolMetadata = brushCursor.metadata;
    if (!toolMetadata) {
      return;
    }

    const annotationUID = toolMetadata.brushCursorUID || 'brushCursor';

    const data = brushCursor.data;
    const color = `rgb(${toolMetadata.segmentColor?.slice(0, 3) || [0, 0, 0]})`;

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return;
    }

    const points = data.handles?.points || [];
    const totalCircles = Math.floor((points?.length || 0) / 4);
    const circleGeometries: Array<{ center: Types.Point2; radius: number }> =
      [];

    for (let i = 0; i < points.length; i += 4) {
      const circlePoints = points.slice(i, i + 4);

      if (circlePoints.length < 2) {
        continue;
      }

      const canvasCoordinates = circlePoints.map((p) =>
        viewport.worldToCanvas(p)
      );
      const bottom = canvasCoordinates[0];
      const top = canvasCoordinates[1];
      const center = [
        Math.floor((bottom[0] + top[0]) / 2),
        Math.floor((bottom[1] + top[1]) / 2),
      ] as Types.Point2;
      const radius = Math.abs(bottom[1] - Math.floor((bottom[1] + top[1]) / 2));

      circleGeometries.push({ center, radius });
    }

    const currentCircle = circleGeometries[circleGeometries.length - 1];

    if (circleGeometries.length > 1) {
      drawPathSvg(
        svgDrawingHelper,
        annotationUID,
        'stroke-preview',
        circleGeometries.map((circle) => circle.center),
        {
          color,
          lineWidth: currentCircle.radius * 2,
          strokeOpacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round',
          lineDash:
            this.centerSegmentIndexInfo.segmentIndex === 0 ? '6,4' : undefined,
        }
      );
    }

    if (currentCircle) {
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        'current-circle',
        currentCircle.center,
        currentCircle.radius,
        {
          color,
          lineWidth: 2,
          strokeOpacity: 1,
          lineDash:
            this.centerSegmentIndexInfo.segmentIndex === 0 ? [1, 2] : null,
        }
      );
    }

    const { dynamicRadiusInCanvas } = configuration?.threshold || {
      dynamicRadiusInCanvas: 0,
    };

    if (dynamicRadiusInCanvas && currentCircle) {
      const circleUID1 = 'dynamic-radius';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID1,
        currentCircle.center,
        dynamicRadiusInCanvas,
        {
          color,
        }
      );
    }
  },
};
