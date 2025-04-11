import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import type { PublicToolProps, ToolProps, EventTypes } from '../../types';
import { triggerSegmentationModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { getActiveSegmentation } from '../../stateManagement/segmentation/activeSegmentation';
import RepresentationTypes from '../../enums/SegmentationRepresentations';
import { setActiveSegmentIndex } from '../../stateManagement/segmentation/segmentIndex';
import {
  getHoveredContourSegmentationAnnotation,
  getSegmentIndexAtLabelmapBorder,
  getSegmentIndexAtWorldPoint,
} from '../../utilities/segmentation';
import { state } from '../../store/state';
import type {
  Segmentation,
  SegmentationRepresentation,
} from '../../types/SegmentationStateTypes';
import { ToolModes } from '../../enums';

/**
 * Represents a tool used for segment selection. It is used to select a segment
 * by hovering over it.
 *
 */
class SegmentSelectTool extends BaseTool {
  static toolName;
  private hoverTimer: ReturnType<typeof setTimeout> | null;

  static SelectMode = {
    Inside: 'Inside',
    Border: 'Border',
  };

  constructor(
    toolProps: PublicToolProps = {},
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
    this.hoverTimer = null;
  }

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): boolean => {
    if (this.mode !== ToolModes.Active) {
      return;
    }

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
}

SegmentSelectTool.toolName = 'SegmentSelectTool';
export default SegmentSelectTool;
