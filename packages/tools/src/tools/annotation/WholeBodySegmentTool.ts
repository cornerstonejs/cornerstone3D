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
import type {
  GrowCutToolData,
  RemoveIslandData,
} from '../base/GrowCutBaseTool';
import GrowCutBaseTool from '../base/GrowCutBaseTool';

// Positive and negative threshold/range (defaults to CT hounsfield ranges)
// https://www.sciencedirect.com/topics/medicine-and-dentistry/hounsfield-scale
const NEGATIVE_PIXEL_RANGE = [-Infinity, -995];
const POSITIVE_PIXEL_RANGE = [0, 1900];
const ISLAND_PIXEL_RANGE = [1000, 1900];
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
      configuration: {
        /**
         * Range that shall be used to set voxel as positive seeds
         */
        positivePixelRange: POSITIVE_PIXEL_RANGE,
        /**
         * Range that shall be used to set voxel as negative seeds
         */
        negativePixelRange: NEGATIVE_PIXEL_RANGE,
        islandRemoval: {
          /**
           * Enable/disable island removal
           */
          enabled: true,
          /**
           * Range that shall be used to set a voxel as a valid island voxel. In
           * this case all island that contains a valid voxel shall not be removed
           * after running removeIsland() method. This is useful to do not add the
           * bed the segmented data.
           */
          islandPixelRange: ISLAND_PIXEL_RANGE,
        },
      },
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

    await super.preMouseDownCallback(evt);
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

  protected async getGrowCutLabelmap(growCutData): Promise<Types.IImageVolume> {
    const {
      segmentation: { segmentIndex, referencedVolumeId },
      renderingEngineId,
      viewportId,
      horizontalLines,
    } = growCutData;
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

    const config = this.configuration;
    const options: GrowCutBoundingBoxOptions = {
      positiveSeedValue: segmentIndex,
      negativeSeedValue: 255,
      negativePixelRange: config.negativePixelRange,
      positivePixelRange: config.positivePixelRange,
    };

    return growCut.runGrowCutForBoundingBox(
      referencedVolumeId,
      boundingBoxInfo,
      options
    );
  }

  protected getRemoveIslandData(): RemoveIslandData {
    const {
      segmentation: { segmentIndex, referencedVolumeId, labelmapVolumeId },
    } = this.growCutData;
    const referencedVolume = cache.getVolume(referencedVolumeId);
    const labelmapVolume = cache.getVolume(labelmapVolumeId);
    const referencedVolumeData =
      referencedVolume.voxelManager.getCompleteScalarDataArray();
    const labelmapData =
      labelmapVolume.voxelManager.getCompleteScalarDataArray();
    const { islandPixelRange } = this.configuration.islandRemoval;
    const islandPointIndexes = [];

    // Working with a range is not accurate enough because it may also include
    // the bed in case a high pixel intensity is found on it. It may also not
    // include the expected region in case there are no high density bones in
    // the expected island.
    //
    // TODO: improve how it looks for pixels in the islands that need to be segmented
    for (let i = 0, len = labelmapData.length; i < len; i++) {
      if (labelmapData[i] !== segmentIndex) {
        continue;
      }

      // Keep all islands that has at least one pixel in the `islandPixelRange` range
      const pixelValue = referencedVolumeData[i];

      if (
        pixelValue >= islandPixelRange[0] &&
        pixelValue <= islandPixelRange[1]
      ) {
        islandPointIndexes.push(i);
      }
    }

    return {
      islandPointIndexes,
    };
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

WholeBodySegmentTool.toolName = 'WholeBodySegment';

export default WholeBodySegmentTool;
