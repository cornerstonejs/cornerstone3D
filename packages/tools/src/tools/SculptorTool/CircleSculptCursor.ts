import type { Types } from '@cornerstonejs/core';
import { getEnabledElement } from '@cornerstonejs/core';
import { ISculptToolShape } from './ISculptToolShape';
import { distanceFromPoint, SculptData } from '../SculptorTool';
import { drawCircle as drawCircleSvg } from '../../drawingSvg';
import { point } from '../../utilities/math';
import { SVGDrawingHelper, EventTypes, Annotation } from '../../types';

export interface PushedHandles {
  first?: number;
  last?: number;
}

class CircleSculptCursor implements ISculptToolShape {
  static shapeName = 'Circle';
  private toolInfo = {
    toolSize: null,
    maxToolSize: null,
  };

  renderShape(
    svgDrawingHelper: SVGDrawingHelper,
    canvasLocation: Types.Point2,
    options: any
  ): void {
    const circleUID = '0';
    drawCircleSvg(
      svgDrawingHelper,
      'SculptorTool',
      circleUID,
      canvasLocation,
      this.toolInfo.toolSize,
      options
    );
  }

  pushHandles(
    viewport: Types.IViewport,
    sculptData: SculptData
  ): PushedHandles {
    const { points, mouseCanvasPoint } = sculptData;
    const pushedHandles: PushedHandles = { first: undefined, last: undefined };

    for (let i = 0; i < points.length; i++) {
      const handleCanvasPoint = viewport.worldToCanvas(points[i]);
      const distanceToHandle = point.distanceToPoint(
        handleCanvasPoint,
        mouseCanvasPoint
      );

      if (distanceToHandle > this.toolInfo.toolSize) {
        continue;
      }

      // Push point if inside circle, to edge of circle.
      this.pushOneHandle(i, distanceToHandle, sculptData);
      if (pushedHandles.first === undefined) {
        pushedHandles.first = i;
        pushedHandles.last = i;
      } else {
        pushedHandles.last = i;
      }
    }

    return pushedHandles;
  }

  configureToolSize(evt: EventTypes.InteractionEventType): void {
    const toolInfo = this.toolInfo;

    if (toolInfo.toolSize && toolInfo.maxToolSize) {
      return;
    }

    const eventData = evt.detail;
    const element = eventData.element;
    const minDim = Math.min(element.clientWidth, element.clientHeight);
    const sampleArea = (minDim * minDim) / 25;
    const maxRadius = Math.sqrt(sampleArea / 3.14);

    toolInfo.toolSize = maxRadius;
    toolInfo.maxToolSize = maxRadius;
  }

  UpdateToolsize(
    canvasCoords: Types.Point2,
    viewport: Types.IViewport,
    activeAnnotation: Annotation
  ): void {
    const toolInfo = this.toolInfo;
    const radius = distanceFromPoint(
      viewport,
      activeAnnotation?.data,
      canvasCoords
    );
    if (radius > 0) {
      toolInfo.toolSize = Math.min(toolInfo.maxToolSize, radius);
    }
  }

  getMaxSpacing(minSpacing: number): number {
    return Math.max(this.toolInfo.toolSize / 4, minSpacing);
  }

  getInsertPosition(
    previousIndex: number,
    nextIndex: number,
    sculptData: SculptData
  ): Types.Point3 {
    let insertPosition: Types.Point2;
    const { points, element, mouseCanvasPoint } = sculptData;
    const toolSize = this.toolInfo.toolSize;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const previousCanvasPoint = viewport.worldToCanvas(points[previousIndex]);
    const nextCanvasPoint = viewport.worldToCanvas(points[nextIndex]);

    const midPoint: Types.Point2 = [
      (previousCanvasPoint[0] + nextCanvasPoint[0]) / 2.0,
      (previousCanvasPoint[1] + nextCanvasPoint[1]) / 2.0,
    ];

    const distanceToMidPoint = point.distanceToPoint(
      mouseCanvasPoint,
      midPoint
    );

    if (distanceToMidPoint < toolSize) {
      const directionUnitVector = {
        x: (midPoint[0] - mouseCanvasPoint[0]) / distanceToMidPoint,
        y: (midPoint[1] - mouseCanvasPoint[1]) / distanceToMidPoint,
      };

      insertPosition = [
        mouseCanvasPoint[0] + toolSize * directionUnitVector.x,
        mouseCanvasPoint[1] + toolSize * directionUnitVector.y,
      ];
    } else {
      insertPosition = midPoint;
    }

    const worldPosition = viewport.canvasToWorld(insertPosition);

    return worldPosition;
  }

  private pushOneHandle(
    i: number,
    distanceToHandle: number,
    sculptData: SculptData
  ): void {
    const { points, mousePoint } = sculptData;
    const toolSize = this.toolInfo.toolSize;
    const handle = points[i];

    const directionUnitVector = {
      x: (handle[0] - mousePoint[0]) / distanceToHandle,
      y: (handle[1] - mousePoint[1]) / distanceToHandle,
      z: (handle[2] - mousePoint[2]) / distanceToHandle,
    };

    const position = {
      x: mousePoint[0] + toolSize * directionUnitVector.x,
      y: mousePoint[1] + toolSize * directionUnitVector.y,
      z: mousePoint[2] + toolSize * directionUnitVector.z,
    };

    handle[0] = position.x;
    handle[1] = position.y;
    handle[2] = position.z;
  }
}

export default CircleSculptCursor;
