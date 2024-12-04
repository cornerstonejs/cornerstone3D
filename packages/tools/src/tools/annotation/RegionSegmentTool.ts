import { vec2, vec3 } from 'gl-matrix';
import {
  getEnabledElement,
  utilities as csUtils,
  getRenderingEngine,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { drawCircle as drawCircleSvg } from '../../drawingSvg';
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
import type { GrowCutSphereOptions } from '../../utilities/segmentation/growCut';
import type { GrowCutToolData } from '../base/GrowCutBaseTool';
import GrowCutBaseTool from '../base/GrowCutBaseTool';

type RegionSegmentToolData = GrowCutToolData & {
  circleCenterPoint: Types.Point3;
  circleBorderPoint: Types.Point3;
};

class RegionSegmentTool extends GrowCutBaseTool {
  static toolName;
  protected growCutData: RegionSegmentToolData | null;

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

    super.preMouseDownCallback(evt);

    Object.assign(this.growCutData, {
      circleCenterPoint: worldPoint,
      circleBorderPoint: worldPoint,
    });

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

    this.growCutData.circleBorderPoint = currentWorldPoint;

    triggerAnnotationRenderForViewportUIDs([viewport.id]);
  };

  private _endCallback = async (evt: EventTypes.InteractionEventType) => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this.runGrowCut();
    this._deactivateDraw(element);

    this.growCutData = null;
    resetElementCursor(element);
    triggerAnnotationRenderForViewportUIDs([viewport.id]);
  };

  protected async getGrowCutLabelmap(): Promise<Types.IImageVolume> {
    const {
      segmentation: { segmentIndex, referencedVolumeId },
      renderingEngineId,
      viewportId,
      circleCenterPoint,
      circleBorderPoint,
    } = this.growCutData;
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportId);
    const worldCircleRadius = vec3.len(
      vec3.sub(
        vec3.create(),
        circleCenterPoint as vec3,
        circleBorderPoint as vec3
      )
    );

    const sphereInfo = {
      center: circleCenterPoint,
      radius: worldCircleRadius,
    };
    const options: GrowCutSphereOptions = {
      positiveSeedValue: segmentIndex,
      negativeSeedValue: 255,
    };

    return growCut.runGrowCutForSphere(
      referencedVolumeId,
      sphereInfo,
      viewport,
      options
    );
  }

  private _activateDraw(element: HTMLDivElement): void {
    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as unknown as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as unknown as EventListener
    );
  }

  private _deactivateDraw = (element: HTMLDivElement): void => {
    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as unknown as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as unknown as EventListener
    );
  };

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): void {
    if (!this.growCutData) {
      return;
    }

    const { viewport } = enabledElement;
    const {
      segmentation: segmentationData,
      circleCenterPoint,
      circleBorderPoint,
    } = this.growCutData;
    const canvasCenterPoint = viewport.worldToCanvas(circleCenterPoint);
    const canvasBorderPoint = viewport.worldToCanvas(circleBorderPoint);
    const vecCenterToBorder = vec2.sub(
      vec2.create(),
      canvasBorderPoint,
      canvasCenterPoint
    );
    const circleRadius = vec2.len(vecCenterToBorder);

    if (csUtils.isEqual(circleRadius, 0)) {
      return;
    }

    const annotationUID = 'growcut';
    const circleUID = '0';

    const { color } = this.getSegmentStyle({
      segmentationId: segmentationData.segmentationId,
      segmentIndex: segmentationData.segmentIndex,
      viewportId: viewport.id,
    });

    drawCircleSvg(
      svgDrawingHelper,
      annotationUID,
      circleUID,
      canvasCenterPoint,
      circleRadius,
      {
        color,
      }
    );
  }
}

RegionSegmentTool.toolName = 'RegionSegment';

export default RegionSegmentTool;
