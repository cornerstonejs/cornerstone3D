import { vec3 } from 'gl-matrix';
import {
  getRenderingEngines,
  CONSTANTS,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { addAnnotation } from '../stateManagement/annotation/annotationState';

import { drawLine as drawLineSvg } from '../drawingSvg';
import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { PublicToolProps, ToolProps, SVGDrawingHelper } from '../types';
import { ReferenceLineAnnotation } from '../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../types/AnnotationStyle';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';

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
    renderingEngine: any;
    sourceViewport: any;
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
        showFullDimension: false,
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

  _init = (): void => {
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

    if (!sourceViewport || !sourceViewport.getImageData()) {
      return;
    }

    const { element } = sourceViewport;
    const { viewUp, viewPlaneNormal } = sourceViewport.getCamera();

    const sourceViewportCanvasCornersInWorld =
      csUtils.getViewportImageCornersInWorld(sourceViewport);

    let annotation = this.editData.annotation;
    const FrameOfReferenceUID = sourceViewport.getFrameOfReferenceUID();

    if (!annotation) {
      const newAnnotation: ReferenceLineAnnotation = {
        highlighted: true,
        invalidated: true,
        metadata: {
          toolName: this.getToolName(),
          viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
          viewUp: <Types.Point3>[...viewUp],
          FrameOfReferenceUID,
          referencedImageId: null,
        },
        data: {
          handles: {
            points: sourceViewportCanvasCornersInWorld,
          },
        },
      };

      addAnnotation(newAnnotation, element);
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

  onSetToolEnabled = (): void => {
    this._init();
  };

  onCameraModified = (evt: Types.EventTypes.CameraModifiedEvent): void => {
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

    if (!sourceViewport) {
      return renderStatus;
    }

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

    const targetViewportPlane = csUtils.planar.planeEquation(
      viewPlaneNormal,
      focalPoint
    );

    // check if the topLeft and bottomLeft line is parallel to the viewUp
    const pointSet1 = [topLeft, bottomLeft, topRight, bottomRight];
    const pointSet2 = [topLeft, topRight, bottomLeft, bottomRight];

    let pointSetToUse = pointSet1;

    let topBottomVec = vec3.subtract(vec3.create(), pointSet1[0], pointSet1[1]);
    topBottomVec = vec3.normalize(vec3.create(), topBottomVec) as Types.Point3;

    let topRightVec = vec3.subtract(vec3.create(), pointSet1[2], pointSet1[0]);
    topRightVec = vec3.normalize(vec3.create(), topRightVec);

    const newNormal = vec3.cross(
      vec3.create(),
      topBottomVec,
      topRightVec
    ) as Types.Point3;

    if (this.isParallel(newNormal, viewPlaneNormal)) {
      return renderStatus;
    }

    // check if it is perpendicular to the viewPlaneNormal which means
    // the line does not intersect the viewPlaneNormal
    if (this.isPerpendicular(topBottomVec, viewPlaneNormal)) {
      // 'use pointSet2';
      pointSetToUse = pointSet2;
    }

    const lineStartWorld = csUtils.planar.linePlaneIntersection(
      pointSetToUse[0],
      pointSetToUse[1],
      targetViewportPlane
    );

    const lineEndWorld = csUtils.planar.linePlaneIntersection(
      pointSetToUse[2],
      pointSetToUse[3],
      targetViewportPlane
    );
    const { annotationUID } = annotation;

    styleSpecifier.annotationUID = annotationUID;
    const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
    const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
    const color = this.getStyle('color', styleSpecifier, annotation);
    const shadow = this.getStyle('shadow', styleSpecifier, annotation);

    let canvasCoordinates = [lineStartWorld, lineEndWorld].map((world) =>
      targetViewport.worldToCanvas(world)
    );

    if (this.configuration.showFullDimension) {
      canvasCoordinates = this.handleFullDimension(
        targetViewport,
        lineStartWorld,
        viewPlaneNormal,
        viewUp,
        lineEndWorld,
        canvasCoordinates
      );
    }

    if (canvasCoordinates.length < 2) {
      return renderStatus;
    }

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

  isPerpendicular = (vec1: Types.Point3, vec2: Types.Point3): boolean => {
    const dot = vec3.dot(vec1, vec2);
    return Math.abs(dot) < EPSILON;
  };

  private handleFullDimension(
    targetViewport: Types.IStackViewport | Types.IVolumeViewport,
    lineStartWorld: Types.Point3,
    viewPlaneNormal: Types.Point3,
    viewUp: Types.Point3,
    lineEndWorld: Types.Point3,
    canvasCoordinates: Types.Point2[]
  ) {
    const renderingEngine = targetViewport.getRenderingEngine();
    const targetId = this.getTargetId(targetViewport);
    const targetImage = this.getTargetIdImage(targetId, renderingEngine);

    const referencedImageId = this.getReferencedImageId(
      targetViewport,
      lineStartWorld,
      viewPlaneNormal,
      viewUp
    );

    if (referencedImageId && targetImage) {
      try {
        const { imageData, dimensions } = targetImage;

        // Calculate bound image coordinates
        const [
          topLeftImageCoord,
          topRightImageCoord,
          bottomRightImageCoord,
          bottomLeftImageCoord,
        ] = [
          imageData.indexToWorld([0, 0, 0]) as Types.Point3,
          imageData.indexToWorld([dimensions[0] - 1, 0, 0]) as Types.Point3,
          imageData.indexToWorld([
            dimensions[0] - 1,
            dimensions[1] - 1,
            0,
          ]) as Types.Point3,
          imageData.indexToWorld([0, dimensions[1] - 1, 0]) as Types.Point3,
        ].map((world) => csUtils.worldToImageCoords(referencedImageId, world));

        // Calculate line start and end image coordinates
        const [lineStartImageCoord, lineEndImageCoord] = [
          lineStartWorld,
          lineEndWorld,
        ].map((world) => csUtils.worldToImageCoords(referencedImageId, world));

        // Calculate intersection points between line and image bounds
        canvasCoordinates = [
          [topLeftImageCoord, topRightImageCoord],
          [topRightImageCoord, bottomRightImageCoord],
          [bottomLeftImageCoord, bottomRightImageCoord],
          [topLeftImageCoord, bottomLeftImageCoord],
        ]
          .map(([start, end]) =>
            this.intersectInfiniteLines(
              start,
              end,
              lineStartImageCoord,
              lineEndImageCoord
            )
          )
          .filter((point) => point && this.isInBound(point, dimensions))
          .map((point) => {
            const world = csUtils.imageToWorldCoords(
              referencedImageId,
              point as Types.Point2
            );
            return targetViewport.worldToCanvas(world);
          });
      } catch (err) {
        console.log(err);
      }
    }
    return canvasCoordinates;
  }

  // get the intersection point between two infinite lines, not line segments
  intersectInfiniteLines(
    line1Start: Types.Point2,
    line1End: Types.Point2,
    line2Start: Types.Point2,
    line2End: Types.Point2
  ) {
    const [x1, y1] = line1Start;
    const [x2, y2] = line1End;
    const [x3, y3] = line2Start;
    const [x4, y4] = line2End;

    // Compute a1, b1, c1, where line joining points 1 and 2 is "a1 x  +  b1 y  +  c1  =  0"
    const a1 = y2 - y1;
    const b1 = x1 - x2;
    const c1 = x2 * y1 - x1 * y2;

    // Compute a2, b2, c2
    const a2 = y4 - y3;
    const b2 = x3 - x4;
    const c2 = x4 * y3 - x3 * y4;

    if (Math.abs(a1 * b2 - a2 * b1) < EPSILON) {
      return;
    }

    const x = (b1 * c2 - b2 * c1) / (a1 * b2 - a2 * b1);
    const y = (a2 * c1 - a1 * c2) / (a1 * b2 - a2 * b1);

    return [x, y];
  }

  isParallel(vec1: Types.Point3, vec2: Types.Point3): boolean {
    return Math.abs(vec3.dot(vec1, vec2)) > 1 - EPSILON;
  }

  isInBound(point: number[], dimensions: Types.Point3): boolean {
    return (
      point[0] >= 0 &&
      point[0] <= dimensions[0] &&
      point[1] >= 0 &&
      point[1] <= dimensions[1]
    );
  }
}

ReferenceLines.toolName = 'ReferenceLines';
export default ReferenceLines;
