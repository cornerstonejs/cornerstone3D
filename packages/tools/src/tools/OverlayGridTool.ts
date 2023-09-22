import { vec3 } from 'gl-matrix';
import {
  metaData,
  CONSTANTS,
  getRenderingEngine,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAnnotations,
} from '../stateManagement/annotation/annotationState';

import { getToolGroup } from '../store/ToolGroupManager';

import { drawLine as drawLineSvg } from '../drawingSvg';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';

import { PublicToolProps, ToolProps, SVGDrawingHelper } from '../types';
import { StyleSpecifier } from '../types/AnnotationStyle';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import { Annotation } from '../types';

const { EPSILON } = CONSTANTS;

export interface OverlayGridAnnotation extends Annotation {
  data: {
    viewportGridInfoMap: Map<string, object>;
    pointSets: Array<object>;
  };
}

/**
 * @public
 */
class OverlayGridTool extends AnnotationDisplayTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        sourceImageIds: [],
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _init = (): void => {
    if (this.configuration.sourceImageIds?.length) {
      const { frameOfReferenceUID } = metaData.get(
        'imagePlaneModule',
        this.configuration.sourceImageIds[0]
      );
      const viewportsInfo = getToolGroup(this.toolGroupId).viewportsInfo;

      const annotations = getAnnotations(
        this.getToolName(),
        frameOfReferenceUID
      );

      if (!annotations?.length) {
        const sourceImageIds = this.configuration.sourceImageIds;
        const pointSets = [];
        for (let i = 0; i < sourceImageIds.length; i++) {
          // check if pointSets for the imageId was calculated. If not calculate and store
          pointSets[i] = this.calculateImageIdPointSets(sourceImageIds[i]);
        }

        const newAnnotation: OverlayGridAnnotation = {
          highlighted: true,
          invalidated: true,
          metadata: {
            toolName: this.getToolName(),
            FrameOfReferenceUID: frameOfReferenceUID,
            referencedImageId: null,
          },
          data: {
            viewportGridInfoMap: new Map(),
            pointSets,
          },
        };

        addAnnotation(newAnnotation, frameOfReferenceUID);
      }
      if (!viewportsInfo?.length) {
        return;
      }

      triggerAnnotationRenderForViewportIds(
        getRenderingEngine(viewportsInfo[0].renderingEngineId),
        viewportsInfo.map(({ viewportId }) => viewportId)
      );
    }
  };

  onSetToolEnabled = (): void => {
    this._init();
  };

  onSetToolActive = (): void => {
    this._init();
  };

  /**
   * Calculates the point sets based on the image corners relative to an imageId
   * @param imageId
   * @returns
   */
  calculateImageIdPointSets = (imageId: string) => {
    const {
      imagePositionPatient,
      rows,
      columns,
      rowCosines,
      columnCosines,
      rowPixelSpacing,
      columnPixelSpacing,
    } = metaData.get('imagePlaneModule', imageId);

    // top left world, top right world, bottom right world, bottom left world
    const topLeft = <Types.Point3>[...imagePositionPatient];
    const topRight = <Types.Point3>[...imagePositionPatient];
    const bottomLeft = <Types.Point3>[...imagePositionPatient];
    const bottomRight = <Types.Point3>[...imagePositionPatient];

    vec3.scaleAndAdd(
      topRight,
      imagePositionPatient,
      columnCosines,
      columns * columnPixelSpacing
    );
    vec3.scaleAndAdd(
      bottomLeft,
      imagePositionPatient,
      rowCosines,
      rows * rowPixelSpacing
    );

    vec3.scaleAndAdd(
      bottomRight,
      bottomLeft,
      columnCosines,
      columns * columnPixelSpacing
    );

    // check if the topLeft and bottomLeft line is parallel to the viewUp
    const pointSet1 = [topLeft, bottomLeft, topRight, bottomRight];
    const pointSet2 = [topLeft, topRight, bottomLeft, bottomRight];

    return { pointSet1, pointSet2 };
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
    let renderStatus = false;
    if (!this.configuration.sourceImageIds?.length) {
      return renderStatus;
    }

    const { viewport: targetViewport, FrameOfReferenceUID } = enabledElement;
    const targetImageIds = targetViewport.getImageIds();
    if (targetImageIds.length < 2) {
      return renderStatus;
    }

    const annotations = getAnnotations(this.getToolName(), FrameOfReferenceUID);
    if (!annotations) {
      return renderStatus;
    }
    const annotation = annotations[0];
    const { annotationUID } = annotation;

    const sourceImageIds = this.configuration.sourceImageIds;
    const { focalPoint, viewPlaneNormal } = targetViewport.getCamera();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };
    const imageIdNormal = <Types.Point3>(
      this.getImageIdNormal(sourceImageIds[0])
    );

    if (this.isParallel(viewPlaneNormal, imageIdNormal)) {
      // If the source and target viewports are parallel, we don't need to render
      return renderStatus;
    }

    const targetViewportPlane = csUtils.planar.planeEquation(
      viewPlaneNormal,
      focalPoint
    );

    const pointSets = annotation.data.pointSets;
    const viewportGridInfoMap = annotation.data.viewportGridInfoMap;
    for (let i = 0; i < sourceImageIds.length; i++) {
      // check if pointSets for the imageId was calculated. If not calculate and store
      const { pointSet1, pointSet2 } = pointSets[i];

      if (!viewportGridInfoMap.get(targetViewport.id)) {
        viewportGridInfoMap.set(targetViewport.id, {
          pointSetsToUse: [],
          lineStartsWorld: [],
          lineEndsWorld: [],
        });
      }

      // check if pointSetToUse was calculated. If not calculate and store
      if (!viewportGridInfoMap.get(targetViewport.id).pointSetsToUse[i]) {
        let pointSetToUse = pointSet1;

        let topBottomVec = vec3.subtract(
          vec3.create(),
          pointSet1[0],
          pointSet1[1]
        );
        topBottomVec = vec3.normalize(
          vec3.create(),
          topBottomVec
        ) as Types.Point3;

        let topRightVec = vec3.subtract(
          vec3.create(),
          pointSet1[2],
          pointSet1[0]
        );
        topRightVec = vec3.normalize(vec3.create(), topRightVec);

        // check if it is perpendicular to the viewPlaneNormal which means
        // the line does not intersect the viewPlaneNormal
        if (this.isPerpendicular(topBottomVec, viewPlaneNormal)) {
          // 'use pointSet2';
          pointSetToUse = pointSet2;
        }
        viewportGridInfoMap.get(targetViewport.id).pointSetsToUse[i] =
          pointSetToUse;

        viewportGridInfoMap.get(targetViewport.id).lineStartsWorld[i] =
          csUtils.planar.linePlaneIntersection(
            pointSetToUse[0],
            pointSetToUse[1],
            targetViewportPlane
          );

        viewportGridInfoMap.get(targetViewport.id).lineEndsWorld[i] =
          csUtils.planar.linePlaneIntersection(
            pointSetToUse[2],
            pointSetToUse[3],
            targetViewportPlane
          );
      }

      const lineStartWorld = viewportGridInfoMap.get(targetViewport.id)
        .lineStartsWorld[i];
      const lineEndWorld = viewportGridInfoMap.get(targetViewport.id)
        .lineEndsWorld[i];

      styleSpecifier.annotationUID = annotationUID;
      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);
      const shadow = this.getStyle('shadow', styleSpecifier, annotation);

      const canvasCoordinates = [lineStartWorld, lineEndWorld].map((world) =>
        targetViewport.worldToCanvas(world)
      );

      const dataId = `${annotationUID}-line`;
      const lineUID = `${i}`;
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
    }

    renderStatus = true;

    return renderStatus;
  };

  isPerpendicular = (vec1: Types.Point3, vec2: Types.Point3): boolean => {
    const dot = vec3.dot(vec1, vec2);
    return Math.abs(dot) < EPSILON;
  };

  isParallel(vec1: Types.Point3, vec2: Types.Point3): boolean {
    return Math.abs(vec3.dot(vec1, vec2)) > 1 - EPSILON;
  }

  getImageIdNormal(imageId: string): vec3 {
    const { imageOrientationPatient } = metaData.get(
      'imagePlaneModule',
      imageId
    );
    const rowCosineVec = vec3.fromValues(
      imageOrientationPatient[0],
      imageOrientationPatient[1],
      imageOrientationPatient[2]
    );
    const colCosineVec = vec3.fromValues(
      imageOrientationPatient[3],
      imageOrientationPatient[4],
      imageOrientationPatient[5]
    );
    return vec3.cross(vec3.create(), rowCosineVec, colCosineVec);
  }
}

OverlayGridTool.toolName = 'OverlayGrid';
export default OverlayGridTool;
