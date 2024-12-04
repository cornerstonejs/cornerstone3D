import { vec3 } from 'gl-matrix';
import {
  getEnabledElement,
  utilities as csUtils,
  cache,
  getRenderingEngine,
  BaseVolumeViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { drawPolyline as drawPolylineSvg } from '../../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';
import { Events } from '../../enums';
import type {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';

import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportIds';
import { growCut } from '../../utilities/segmentation';
import type { GrowCutBoundingBoxOptions } from '../../utilities/segmentation/growCut';
import type { GrowCutToolData } from '../base/GrowCutBaseTool';
import GrowCutBaseTool from '../base/GrowCutBaseTool';

const { transformWorldToIndex, transformIndexToWorld } = csUtils;

type HorizontalLine = [Types.Point3, Types.Point3];

type WholeBodySegmentToolData = GrowCutToolData & {
  horizontalLines: [HorizontalLine, HorizontalLine];
};

class WholeBodySegmentTool extends GrowCutBaseTool {
  static toolName;
  protected growCutData: WholeBodySegmentToolData | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {},
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  async preMouseDownCallback(
    evt: EventTypes.MouseDownActivateEventType
  ): Promise<boolean> {
    const eventData = evt.detail;
    const { element, currentPoints } = eventData;
    const { world: worldPoint } = currentPoints;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const linePoints = this._getHorizontalLineWorldPoints(
      enabledElement,
      worldPoint
    );

    super.preMouseDownCallback(evt);
    this.growCutData.horizontalLines = [linePoints, linePoints];
    this._activateDraw(element);

    hideElementCursor(element);
    triggerAnnotationRenderForViewportUIDs([viewport.id]);

    return true;
  }

  private _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element, currentPoints } = eventData;
    const { world: currentWorldPoint } = currentPoints;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const linePoints = this._getHorizontalLineWorldPoints(
      enabledElement,
      currentWorldPoint
    );

    this.growCutData.horizontalLines[1] = linePoints;

    triggerAnnotationRenderForViewportUIDs([viewport.id]);
  };

  private _endCallback = async (evt: EventTypes.InteractionEventType) => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    await this.runGrowCut();
    this._deactivateDraw(element);

    this.growCutData = null;

    resetElementCursor(element);
    triggerAnnotationRenderForViewportUIDs([viewport.id]);
  };

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): void {
    if (!this.growCutData) {
      return;
    }

    const { segmentation: segmentationData, horizontalLines } =
      this.growCutData;

    if (horizontalLines.length !== 2) {
      return;
    }

    const { viewport } = enabledElement;
    const { segmentationId, segmentIndex } = segmentationData;
    const [line1, line2] = horizontalLines;
    const [worldLine1P1, worldLine1P2] = line1;
    const [worldLine2P1, worldLine2P2] = line2;

    const canvasPoints = [
      worldLine1P1,
      worldLine1P2,
      worldLine2P2,
      worldLine2P1,
    ].map((worldPoint) => viewport.worldToCanvas(worldPoint));

    const annotationUID = 'growCutRect';
    const squareGroupUID = '0';

    const { color, fillColor, lineWidth, fillOpacity, lineDash } =
      this.getSegmentStyle({
        segmentationId,
        segmentIndex,
        viewportId: viewport.id,
      });

    drawPolylineSvg(
      svgDrawingHelper,
      annotationUID,
      squareGroupUID,
      canvasPoints,
      {
        color,
        fillColor,
        fillOpacity,
        lineWidth,
        lineDash,
        closePath: true,
      }
    );
  }

  protected async getGrowCutLabelmap(): Promise<Types.IImageVolume> {
    const {
      segmentation: { segmentIndex, referencedVolumeId },
      renderingEngineId,
      viewportId,
      horizontalLines,
    } = this.growCutData;
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportId);
    const [line1, line2] = horizontalLines;
    const worldSquarePoints = [line1[0], line1[1], line2[1], line2[0]];
    const referencedVolume = cache.getVolume(referencedVolumeId);
    const { topLeft: worldTopLeft, bottomRight: worldBottomRight } =
      this._getWorldBoundingBoxFromProjectedSquare(viewport, worldSquarePoints);

    const ijkTopLeft = transformWorldToIndex(
      referencedVolume.imageData,
      worldTopLeft
    );

    const ijkBottomRight = transformWorldToIndex(
      referencedVolume.imageData,
      worldBottomRight
    );

    const boundingBoxInfo = {
      boundingBox: {
        ijkTopLeft,
        ijkBottomRight,
      },
    };

    // @ts-expect-error
    const options: GrowCutBoundingBoxOptions = {
      positiveSeedValue: segmentIndex,
      negativeSeedValue: 255,
    };

    return growCut.runGrowCutForBoundingBox(
      referencedVolumeId,
      boundingBoxInfo,
      options
    );
  }

  private _activateDraw(element: HTMLDivElement): void {
    // @ts-expect-error
    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as unknown as EventListener
    );
    // @ts-expect-error
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);
  }

  private _deactivateDraw = (element: HTMLDivElement): void => {
    // @ts-expect-error
    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as unknown as EventListener
    );
    // @ts-expect-error
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);
  };

  private _projectWorldPointAcrossSlices(
    viewport: Types.IViewport,
    worldEdgePoint: Types.Point3,
    vecDirection: Types.Point3
  ) {
    const volume = this._getViewportVolume(viewport);
    const { dimensions } = volume;
    const ijkPoint: Types.Point3 = transformWorldToIndex(
      volume.imageData,
      worldEdgePoint
    );
    const axis = vecDirection.findIndex((n) => csUtils.isEqual(Math.abs(n), 1));

    if (axis === -1) {
      throw new Error('Non-orthogonal direction vector');
    }

    const ijkLineP1: Types.Point3 = [...ijkPoint];
    const ijkLineP2: Types.Point3 = [...ijkPoint];

    ijkLineP1[axis] = 0;
    ijkLineP2[axis] = dimensions[axis] - 1;

    return [ijkLineP1, ijkLineP2];
  }

  private _getCuboidIJKEdgePointsFromProjectedWorldPoint(
    viewport: Types.IViewport,
    worldEdgePoint: Types.Point3
  ) {
    const { viewPlaneNormal } = viewport.getCamera();

    return this._projectWorldPointAcrossSlices(
      viewport,
      worldEdgePoint,
      viewPlaneNormal
    );
  }

  private _getWorldCuboidCornerPoints(
    viewport: Types.IViewport,
    worldSquarePoints: Types.Point3[]
  ): Types.Point3[] {
    const cuboidPoints = [];
    const volume = this._getViewportVolume(viewport);

    worldSquarePoints.forEach((worldSquarePoint) => {
      const ijkEdgePoints = this._getCuboidIJKEdgePointsFromProjectedWorldPoint(
        viewport,
        worldSquarePoint
      );

      const worldEdgePoints = ijkEdgePoints.map((ijkPoint) =>
        transformIndexToWorld(volume.imageData, ijkPoint)
      );

      cuboidPoints.push(...worldEdgePoints);
    });

    return cuboidPoints;
  }

  private _getWorldBoundingBoxFromProjectedSquare(
    viewport: Types.IViewport,
    worldSquarePoints: Types.Point3[]
  ) {
    const worldCuboidPoints = this._getWorldCuboidCornerPoints(
      viewport,
      worldSquarePoints
    );
    const topLeft: Types.Point3 = [...worldCuboidPoints[0]];
    const bottomRight: Types.Point3 = [...worldCuboidPoints[0]];

    worldCuboidPoints.forEach((worldPoint) => {
      vec3.min(topLeft, topLeft, worldPoint);
      vec3.max(bottomRight, bottomRight, worldPoint);
    });

    return { topLeft, bottomRight };
  }

  private _getViewportVolume(viewport: Types.IViewport) {
    if (!(viewport instanceof BaseVolumeViewport)) {
      throw new Error('Viewport is not a BaseVolumeViewport');
    }

    const volumeId = viewport.getAllVolumeIds()[0];
    return cache.getVolume(volumeId);
  }

  private _getHorizontalLineIJKPoints(
    enabledElement: Types.IEnabledElement,
    worldPoint: Types.Point3
  ): [Types.Point3, Types.Point3] {
    const { viewport } = enabledElement;
    const volume = this._getViewportVolume(viewport);
    const { dimensions } = volume;
    const ijkPoint: Types.Point3 = transformWorldToIndex(
      volume.imageData,
      worldPoint
    );
    const { viewUp, viewPlaneNormal } = viewport.getCamera();
    const vecRow = vec3.cross(vec3.create(), viewUp, viewPlaneNormal);
    const axis = vecRow.findIndex((n) => csUtils.isEqual(Math.abs(n), 1));
    const ijkLineP1: Types.Point3 = [...ijkPoint];
    const ijkLineP2: Types.Point3 = [...ijkPoint];

    ijkLineP1[axis] = 0;
    ijkLineP2[axis] = dimensions[axis] - 1;

    return [ijkLineP1, ijkLineP2];
  }

  private _getHorizontalLineWorldPoints(
    enabledElement: Types.IEnabledElement,
    worldPoint: Types.Point3
  ): [Types.Point3, Types.Point3] {
    const { viewport } = enabledElement;
    const volume = this._getViewportVolume(viewport);
    const [ijkPoint1, ijkPoint2] = this._getHorizontalLineIJKPoints(
      enabledElement,
      worldPoint
    );

    const worldPoint1 = transformIndexToWorld(volume.imageData, ijkPoint1);
    const worldPoint2 = transformIndexToWorld(volume.imageData, ijkPoint2);

    return [worldPoint1, worldPoint2];
  }
}

WholeBodySegmentTool.toolName = 'WholeBodySegmentTool';

export default WholeBodySegmentTool;
