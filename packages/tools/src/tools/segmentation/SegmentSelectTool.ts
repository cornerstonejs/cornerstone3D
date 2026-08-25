import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import type { PublicToolProps, ToolProps, EventTypes } from '../../types';
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
import { ToolModes } from '../../enums';

/**
 * Represents a tool used for segment selection. It is used to select a segment
 * by hovering over it.
 *
 */
class SegmentSelectTool extends BaseTool {
  static toolName;
  private hoverTimer: ReturnType<typeof setTimeout> | null;
  private hoverElement: HTMLDivElement | null = null;

  static SelectMode = {
    Inside: 'Inside',
    Border: 'Border',
  };

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse'],
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

    // The hover activation is debounced, so the timer can still be pending after
    // the pointer has left the viewport (e.g. moving to the segmentation panel to
    // click a segment). Cancel it on mouseleave, otherwise a stale hover fires
    // ~hoverTimeout later and overrides the selection the user just made.
    const { element } = evt.detail;
    if (this.hoverElement !== element) {
      this._detachHoverLeaveListener();
      this.hoverElement = element;
      element.addEventListener('mouseleave', this._cancelPendingHover);
    }

    this.hoverTimer = setTimeout(() => {
      this._setActiveSegment(evt);
      this.hoverTimer = null;
    }, this.configuration.hoverTimeout);

    return true;
  };

  private _cancelPendingHover = (): void => {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  };

  private _detachHoverLeaveListener = (): void => {
    if (this.hoverElement) {
      this.hoverElement.removeEventListener(
        'mouseleave',
        this._cancelPendingHover
      );
      this.hoverElement = null;
    }
  };

  onSetToolEnabled = (): void => {
    this.onSetToolActive();
  };

  onSetToolActive = (): void => {
    this.hoverTimer = null;
  };

  onSetToolDisabled = (): void => {
    this._cancelPendingHover();
    this._detachHoverLeaveListener();
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
