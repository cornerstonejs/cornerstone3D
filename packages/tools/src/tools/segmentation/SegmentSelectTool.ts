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
import { setActiveSegmentIndex } from '../../stateManagement/segmentation/segmentIndex';
import {
  getHoveredContourSegmentationAnnotation,
  getSegmentIndexAtLabelmapBorder,
  getSegmentIndexAtWorldPoint,
} from '../../utilities/segmentation';
import { state } from '../../store/state';
import type { Segmentation } from '../../types/SegmentationStateTypes';
import drawLinkedTextBoxSvg from '../../drawingSvg/drawLinkedTextBox';

/**
 * Represents a tool used for segment selection. It is used to select a segment
 * by hovering over it.
 *
 */
class SegmentSelectTool extends BaseTool {
  static toolName;
  private hoverTimer: ReturnType<typeof setTimeout> | null;
  private data;
  private _editData;

  static SelectMode = {
    Inside: 'Inside',
    Border: 'Border',
  };

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
        mode: SegmentSelectTool.SelectMode.Border,
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
      this._setActiveSegment(evt);
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

  _setActiveSegment(evt = {} as EventTypes.InteractionEventType): void {
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

    this._setActiveSegmentForType(activeSegmentation, worldPoint, viewport);
  }

  _setActiveSegmentForType(
    activeSegmentation: Segmentation,
    worldPoint: Types.Point3,
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ): void {
    const imageDataInfo = viewport.getImageData();

    if (!imageDataInfo) {
      return;
    }

    const { segmentationId, representationData } = activeSegmentation;

    let hoveredSegmentIndex;

    if (this.configuration.mode === SegmentSelectTool.SelectMode.Inside) {
      hoveredSegmentIndex = getSegmentIndexAtWorldPoint(
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
      };
    } else {
      if (representationData.Labelmap) {
        hoveredSegmentIndex = getSegmentIndexAtLabelmapBorder(
          segmentationId,
          worldPoint,
          {
            viewport,
            searchRadius: this.configuration.searchRadius,
          }
        );
      } else if (representationData.Contour) {
        hoveredSegmentIndex =
          getHoveredContourSegmentationAnnotation(segmentationId);
      } else if (representationData.Surface) {
        // Handle Surface representation if needed
      }
    }

    // No need to select background
    if (!hoveredSegmentIndex || hoveredSegmentIndex === 0) {
      return;
    }

    setActiveSegmentIndex(segmentationId, hoveredSegmentIndex);

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
      hoveredSegmentLabel = '(empty)',
      canvasCoordinates,
    } = this._editData;

    const textBoxPosition = viewport.worldToCanvas(
      this.data.handles.textBox.worldPosition
    );

    const boundingBox = drawLinkedTextBoxSvg(
      svgDrawingHelper,
      'annotationUID',
      'textBoxUID',
      [hoveredSegmentLabel],
      textBoxPosition,
      canvasCoordinates,
      {},
      {}
    );

    const { x: left, y: top, width, height } = boundingBox;

    this.data.handles.textBox.worldBoundingBox = {
      topLeft: viewport.canvasToWorld([left, top]),
      topRight: viewport.canvasToWorld([left + width, top]),
      bottomLeft: viewport.canvasToWorld([left, top + height]),
      bottomRight: viewport.canvasToWorld([left + width, top + height]),
    };
  }
}

SegmentSelectTool.toolName = 'SegmentSelectTool';
export default SegmentSelectTool;
