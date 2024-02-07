import { getRenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAnnotations,
} from '../stateManagement/annotation/annotationState';
import { drawPath } from '../drawingSvg';
import { getToolGroup } from '../store/ToolGroupManager';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { PublicToolProps, ToolProps, SVGDrawingHelper } from '../types';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import { Annotation } from '../types';
import { distanceToPoint } from '../utilities/math/point';
import { pointToString } from '../utilities/pointToString';
import { polyDataUtils } from '../utilities';

export interface SegmentationIntersectionAnnotation extends Annotation {
  data: {
    actorsWorldPointsMap: Map<string, Map<string, object>>;
  };
}

class SegmentationIntersectionTool extends AnnotationDisplayTool {
  static toolName;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {
        opacity: 0.5,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Initialize the annotation data and calculates surface intersections
   * @returns
   */
  _init = (): void => {
    const viewportsInfo = getToolGroup(this.toolGroupId).viewportsInfo;

    if (!viewportsInfo?.length) {
      console.warn(this.getToolName() + 'Tool: No viewports found');
      return;
    }

    const firstViewport = getRenderingEngine(
      viewportsInfo[0].renderingEngineId
    )?.getViewport(viewportsInfo[0].viewportId);

    if (!firstViewport) {
      return;
    }
    const frameOfReferenceUID = firstViewport.getFrameOfReferenceUID();
    const annotations = getAnnotations(this.getToolName(), frameOfReferenceUID);

    if (!annotations?.length) {
      const actorsWorldPointsMap = new Map();
      calculateSurfaceSegmentationIntersections(
        actorsWorldPointsMap,
        viewportsInfo
      );
      const newAnnotation: SegmentationIntersectionAnnotation = {
        highlighted: true,
        invalidated: true,
        metadata: {
          toolName: this.getToolName(),
          FrameOfReferenceUID: frameOfReferenceUID,
          referencedImageId: null,
        },
        data: {
          actorsWorldPointsMap,
        },
      };

      addAnnotation(newAnnotation, frameOfReferenceUID);
    }

    triggerAnnotationRenderForViewportIds(
      getRenderingEngine(viewportsInfo[0].renderingEngineId),
      viewportsInfo.map(({ viewportId }) => viewportId)
    );
  };

  onSetToolEnabled = (): void => {
    this._init();
  };

  onCameraModified = (evt: Types.EventTypes.CameraModifiedEvent): void => {
    this._init();
  };

  /**
   * Renders the surface intersections
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    const { viewport, FrameOfReferenceUID } = enabledElement;

    let renderStatus = false;

    const annotations = getAnnotations(this.getToolName(), FrameOfReferenceUID);
    if (!annotations?.length) {
      return renderStatus;
    }
    const annotation = annotations[0];
    const { annotationUID } = annotation;
    const actorsWorldPointsMap = annotation.data.actorsWorldPointsMap;

    calculateSurfaceSegmentationIntersectionsForViewport(
      actorsWorldPointsMap,
      viewport
    );

    const actorEntries = viewport.getActors();
    const cacheId = getCacheId(viewport);

    actorEntries.forEach((actorEntry) => {
      if (!actorEntry?.clippingFilter) {
        return;
      }
      const actorWorldPointMap = actorsWorldPointsMap.get(actorEntry.uid);
      if (!actorWorldPointMap) {
        return;
      }
      if (!actorWorldPointMap.get(cacheId)) {
        return;
      }
      let polyLineIdx = 1;
      const { worldPointsSet, color } = actorWorldPointMap.get(cacheId);
      for (let i = 0; i < worldPointsSet.length; i++) {
        const worldPoints = worldPointsSet[i];
        const canvasPoints = worldPoints.map((point) =>
          viewport.worldToCanvas(point)
        );

        const options = {
          color: color,
          fillColor: color,
          fillOpacity: this.configuration.opacity,
          closePath: true,
          lineWidth: 2,
        };

        const polyLineUID = actorEntry.uid + '#' + polyLineIdx;
        drawPath(
          svgDrawingHelper,
          annotationUID,
          polyLineUID,
          canvasPoints,
          options
        );
        polyLineIdx++;
      }
    });

    renderStatus = true;
    return renderStatus;
  };
}

/**
 * Calculates surface intersections points for all surface actors in a list of viewports
 * @param actorWorldPointsMap
 * @param viewportsInfo
 */
function calculateSurfaceSegmentationIntersections(
  actorsWorldPointsMap,
  viewportsInfo
) {
  viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
    const viewport =
      getRenderingEngine(renderingEngineId)?.getViewport(viewportId);
    calculateSurfaceSegmentationIntersectionsForViewport(
      actorsWorldPointsMap,
      viewport
    );
  });
}

/**
 * Calculates surface intersections points for all surface actors in a viewport
 * generating a set of polyline points for each actor
 * @param actorWorldPointsMap
 * @param viewport
 */
function calculateSurfaceSegmentationIntersectionsForViewport(
  actorsWorldPointsMap,
  viewport
) {
  const actorEntries = viewport.getActors();

  // we should not use the focalPoint here, since the pan and zoom updates it,
  // imageIndex is reliable enough
  const cacheId = getCacheId(viewport);

  actorEntries.forEach((actorEntry) => {
    if (!actorEntry?.clippingFilter) {
      return;
    }

    let actorWorldPointsMap = actorsWorldPointsMap.get(actorEntry.uid);
    if (!actorWorldPointsMap) {
      actorWorldPointsMap = new Map();
      actorsWorldPointsMap.set(actorEntry.uid, actorWorldPointsMap);
    }
    if (!actorWorldPointsMap.get(cacheId)) {
      const polyData = actorEntry.clippingFilter.getOutputData();
      const worldPointsSet = polyDataUtils.getPolyDataPoints(polyData);
      if (!worldPointsSet) {
        return;
      }

      // worldPointsSet = removeExtraPoints(viewport, worldPointsSet);
      const colorArray = actorEntry.actor.getProperty().getColor();
      const color = colorToString(colorArray);
      actorWorldPointsMap.set(cacheId, { worldPointsSet, color });
    }
  });
}

function getCacheId(viewport) {
  const { viewPlaneNormal } = viewport.getCamera();
  const imageIndex = viewport.getCurrentImageIdIndex();
  return `${viewport.id}-${pointToString(viewPlaneNormal)}-${imageIndex}`;
}

/**
 * Transform a color array into a string
 * @param colorArray
 * @returns
 */
function colorToString(colorArray): string {
  function colorComponentToString(component) {
    let componentString = Math.floor(component * 255).toString(16);
    if (componentString.length === 1) {
      componentString = '0' + componentString;
    }
    return componentString;
  }
  return (
    '#' +
    colorComponentToString(colorArray[0]) +
    colorComponentToString(colorArray[1]) +
    colorComponentToString(colorArray[2])
  );
}

/**
 * Remove duplicate and unnecessary points
 * @param worldPoints
 * @param canvasPoints
 * @returns
 */
function removeExtraPoints(viewport, worldPointsSet) {
  return worldPointsSet.map((worldPoints) => {
    const canvasPoints = worldPoints.map((point) => {
      const canvasPoint = viewport.worldToCanvas(point);
      return [Math.floor(canvasPoint[0]), Math.floor(canvasPoint[1])];
    });

    let lastPoint;
    const newWorldPoints = [];
    let newCanvasPoints = [];
    // removing duplicate points
    for (let i = 0; i < worldPoints.length; i++) {
      if (lastPoint) {
        if (distanceToPoint(lastPoint, canvasPoints[i]) > 0) {
          newWorldPoints.push(worldPoints[i]);
          newCanvasPoints.push(canvasPoints[i]);
        }
      }
      lastPoint = canvasPoints[i];
    }

    // checking if a middle point is near the start
    const firstPoint = newCanvasPoints[0];
    for (
      let j = Math.min(30, newCanvasPoints.length);
      j < newCanvasPoints.length;
      j++
    ) {
      if (distanceToPoint(firstPoint, newCanvasPoints[j]) < 0.5) {
        newCanvasPoints = newCanvasPoints.slice(0, j);
        return newWorldPoints.slice(0, j);
      }
    }
    return newWorldPoints;
  });
}

SegmentationIntersectionTool.toolName = 'SegmentationIntersection';
export default SegmentationIntersectionTool;
