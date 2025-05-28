import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import type {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import { triggerSegmentationModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { getActiveSegmentation } from '../../stateManagement/segmentation/activeSegmentation';
import { getSegmentIndexAtWorldPoint } from '../../utilities/segmentation';
import { state } from '../../store/state';
import type { Segmentation } from '../../types/SegmentationStateTypes';
import { drawLinkedTextBox as drawLinkedTextBoxSvg } from '../../drawingSvg';

/**
 * Represents a tool used for segment selection. It is used to select a segment
 * by hovering over it.
 *
 */
class SegmentLabelTool extends BaseTool {
  static toolName;
  private hoverTimer: ReturnType<typeof setTimeout> | null;
  private data;
  private _editData;

  constructor(
    toolProps: PublicToolProps & Record<string, unknown> = {
      data: {
        handles: {
          textBox: {
            worldPosition: <Types.Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Types.Point3>[0, 0, 0],
              topRight: <Types.Point3>[0, 0, 0],
              bottomLeft: <Types.Point3>[0, 0, 0],
              bottomRight: <Types.Point3>[0, 0, 0],
            },
          },
        },
      },
    },
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        hoverTimeout: 100,
        searchRadius: 6, // search for border in a 6px radius
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.data = toolProps.data ?? {
      handles: {
        textBox: {
          worldPosition: <Types.Point3>[0, 0, 0],
          worldBoundingBox: {
            topLeft: <Types.Point3>[0, 0, 0],
            topRight: <Types.Point3>[0, 0, 0],
            bottomLeft: <Types.Point3>[0, 0, 0],
            bottomRight: <Types.Point3>[0, 0, 0],
          },
        },
      },
    };
    this.hoverTimer = null;
  }

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): boolean => {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
    }

    this.hoverTimer = setTimeout(() => {
      this._setHoveredSegment(evt);
      this.hoverTimer = null;
    }, this.configuration.hoverTimeout);

    return true;
  };

  onSetToolEnabled = (): void => {
    this.onSetToolActive();
  };

  onSetToolActive = (): void => {
    this.hoverTimer = null;
  };

  onSetToolDisabled = (): void => {
    this.hoverTimer = null;
  };

  _setHoveredSegment(evt = {} as EventTypes.InteractionEventType): void {
    if (state.isInteractingWithTool) {
      return;
    }

    const { element, currentPoints } = evt.detail;

    const worldPoint = currentPoints.world;

    const enabledElement = getEnabledElement(element);

    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;

    const activeSegmentation = getActiveSegmentation(viewport.id);

    if (!activeSegmentation) {
      return;
    }

    this._setHoveredSegmentForType(activeSegmentation, worldPoint, viewport);
  }

  _setHoveredSegmentForType(
    activeSegmentation: Segmentation,
    worldPoint: Types.Point3,
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ): void {
    const imageDataInfo = viewport.getImageData();

    if (!imageDataInfo) {
      return;
    }

    const { segmentationId } = activeSegmentation;

    const hoveredSegmentIndex = getSegmentIndexAtWorldPoint(
      segmentationId,
      worldPoint,
      {
        viewport,
      }
    );
    const segment = activeSegmentation.segments[hoveredSegmentIndex];
    const label = segment?.label;
    const canvasCoordinates = viewport.worldToCanvas(worldPoint);
    this._editData = {
      hoveredSegmentIndex,
      hoveredSegmentLabel: label,
      canvasCoordinates,
      worldPoint,
    };

    // No need to select background
    if (!hoveredSegmentIndex || hoveredSegmentIndex === 0) {
      return;
    }

    const renderingEngine = viewport.getRenderingEngine();
    const viewportIds = renderingEngine.getViewports().map((v) => v.id);

    // update states
    triggerSegmentationModified(segmentationId);
    triggerAnnotationRenderForViewportIds(viewportIds);
  }

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ) {
    if (!this._editData) {
      return;
    }

    const { viewport } = enabledElement;

    const {
      hoveredSegmentIndex,
      hoveredSegmentLabel,
      canvasCoordinates,
      worldPoint,
    } = this._editData;

    if (!hoveredSegmentIndex) {
      return;
    }

    const textBoxPosition = viewport.worldToCanvas(worldPoint);

    const boundingBox = drawLinkedTextBoxSvg(
      svgDrawingHelper,
      'segmentSelectLabelAnnotation',
      'segmentSelectLabelTextBox',
      [hoveredSegmentLabel ? hoveredSegmentLabel : '(unnamed segment)'],
      textBoxPosition,
      [canvasCoordinates],
      {},
      {}
    );

    const left = canvasCoordinates[0];
    const top = canvasCoordinates[1];
    const { width, height } = boundingBox;

    this.data.handles.textBox.worldBoundingBox = {
      topLeft: viewport.canvasToWorld([left, top]),
      topRight: viewport.canvasToWorld([left + width, top]),
      bottomLeft: viewport.canvasToWorld([left, top + height]),
      bottomRight: viewport.canvasToWorld([left + width, top + height]),
    };
  }
}

SegmentLabelTool.toolName = 'SegmentLabelTool';
export default SegmentLabelTool;
