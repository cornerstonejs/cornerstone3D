import { vec3 } from 'gl-matrix';
import {
  utilities as csUtils,
  getRenderingEngines,
  CONSTANTS,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { addAnnotation } from '../stateManagement/annotation/annotationState';

import { drawLine as drawLineSvg } from '../drawingSvg';
import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import throttle from '../utilities/throttle';

import { PublicToolProps, ToolProps, SVGDrawingHelper } from '../types';
import { ReferenceLineAnnotation } from '../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../types/AnnotationStyle';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import {
  linePlaneIntersection,
  planeEquation,
} from '../../../core/src/utilities/planar';

const { EPSILON } = CONSTANTS;

/**
 * @public
 */

class ReferenceLines extends AnnotationDisplayTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  editData: {
    renderingEngine: Types.IRenderingEngine;
    sourceViewport: Types.IVolumeViewport;
    annotation: ReferenceLineAnnotation;
  } | null = {} as any;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        sourceViewportId: '',
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    // this._throttledCalculateCachedStats = throttle(
    //   this._calculateCachedStats,
    //   100,
    //   { trailing: true }
    // );
  }

  _init = () => {
    const renderingEngines = getRenderingEngines();
    const renderingEngine = renderingEngines[0];

    // Todo: handle this case where it is too soon to get the rendering engine
    if (!renderingEngine) {
      return;
    }

    let viewports = renderingEngine.getViewports();
    viewports = filterViewportsWithToolEnabled(viewports, this.getToolName());

    const sourceViewport = renderingEngine.getViewport(
      this.configuration.sourceViewportId
    ) as Types.IVolumeViewport;

    const { canvas, element } = sourceViewport;

    const { viewUp, viewPlaneNormal } = sourceViewport.getCamera();

    // topLeft, topRight, bottomLeft and bottomRight
    const sourceViewportCanvasCornersInWorld = [
      sourceViewport.canvasToWorld([0, 0]),
      sourceViewport.canvasToWorld([canvas.width, 0]),
      sourceViewport.canvasToWorld([0, canvas.height]),
      sourceViewport.canvasToWorld([canvas.width, canvas.height]),
    ];

    let annotation = this.editData.annotation;

    if (!annotation) {
      const newAnnotation: ReferenceLineAnnotation = {
        highlighted: true,
        invalidated: true,
        metadata: {
          toolName: this.getToolName(),
          viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
          viewUp: <Types.Point3>[...viewUp],
          FrameOfReferenceUID: sourceViewport.getFrameOfReferenceUID(),
          referencedImageId: null,
        },
        data: {
          handles: {
            points: sourceViewportCanvasCornersInWorld,
          },
        },
      };

      addAnnotation(element, newAnnotation);
      annotation = newAnnotation;
    } else {
      this.editData.annotation.data.handles.points =
        sourceViewportCanvasCornersInWorld;
    }

    this.editData = {
      sourceViewport,
      renderingEngine,
      annotation,
    };

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      viewports
        .filter((viewport) => viewport.id !== sourceViewport.id)
        .map((viewport) => viewport.id)
    );
  };

  onSetToolEnabled = () => {
    this._init();
  };

  onCameraModified = (evt) => {
    // If the camera is modified, we need to update the reference lines
    // we really don't care which viewport triggered the
    // camera modification, since we want to update all of them
    // with respect to the targetViewport
    this._init();
  };

  /**
   * it is used to draw the length annotation in each
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
    const { viewport: targetViewport } = enabledElement;
    const { annotation, sourceViewport } = this.editData;

    let renderStatus = false;

    if (sourceViewport.id === targetViewport.id) {
      // If the source viewport is the same as the current viewport, we don't need to render
      return renderStatus;
    }

    if (!annotation || !annotation?.data?.handles?.points) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    // top left world, top right world, bottom right world, bottom left world
    const topLeft = annotation.data.handles.points[0];
    const topRight = annotation.data.handles.points[1];
    const bottomLeft = annotation.data.handles.points[2];
    const bottomRight = annotation.data.handles.points[3];

    const { focalPoint, viewPlaneNormal, viewUp } = targetViewport.getCamera();
    const { viewPlaneNormal: sourceViewPlaneNormal } =
      sourceViewport.getCamera();

    if (this.isParallel(viewPlaneNormal, sourceViewPlaneNormal)) {
      // If the source and target viewports are parallel, we don't need to render
      return renderStatus;
    }

    const targetViewportPlane = planeEquation(viewPlaneNormal, focalPoint);

    // check if the topLeft and bottomLeft line is parallel to the viewUp

    const point1 = topLeft;
    const point2 = bottomLeft;
    const point3 = topRight;
    const point4 = bottomRight;

    let topBottomVec = vec3.subtract(vec3.create(), point2, point1);
    topBottomVec = vec3.normalize(vec3.create(), topBottomVec);

    let topRightVec = vec3.subtract(vec3.create(), point3, point1);
    topRightVec = vec3.normalize(vec3.create(), topRightVec);

    let lineStartWorld = linePlaneIntersection(
      point1,
      point2,
      targetViewportPlane
    );

    let lineEndWorld;

    if (lineStartWorld.some((value) => isNaN(value))) {
      lineStartWorld = linePlaneIntersection(
        point1,
        point3,
        targetViewportPlane
      );

      if (lineStartWorld.some((value) => isNaN(value))) {
        return renderStatus;
      }

      lineEndWorld = linePlaneIntersection(point2, point4, targetViewportPlane);
    } else {
      lineEndWorld = linePlaneIntersection(point3, point4, targetViewportPlane);
    }

    const { annotationUID } = annotation;

    styleSpecifier.annotationUID = annotationUID;
    const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
    const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
    const color = this.getStyle('color', styleSpecifier, annotation);
    const shadow = this.getStyle('shadow', styleSpecifier, annotation);

    const canvasCoordinates = [lineStartWorld, lineEndWorld].map((world) =>
      targetViewport.worldToCanvas(world)
    );

    const dataId = `${annotationUID}-line`;
    const lineUID = '1';
    drawLineSvg(
      svgDrawingHelper,
      annotationUID,
      lineUID,
      canvasCoordinates[0],
      canvasCoordinates[1],
      {
        color,
        width: lineWidth,
        lineDash,
        shadow,
      },
      dataId
    );

    renderStatus = true;

    return renderStatus;
  };

  isPerpendicular = (vec1, vec2) => {
    const dot = vec3.dot(vec1, vec2);
    return Math.abs(dot) < EPSILON;
  };

  isParallel(vec1, vec2) {
    return Math.abs(vec3.dot(vec1, vec2)) > 1 - EPSILON;
  }
}

ReferenceLines.toolName = 'ReferenceLines';
export default ReferenceLines;
