import { eventTarget, type Types } from '@cornerstonejs/core';
import { Events } from '../../../enums';
import type { EventTypes } from '../../../types';
import {
  appendLazyBrushPreviewCircle,
  appendLazyBrushStrokePoint,
} from './lazyBrushPreview';

class LazyBrushEditController {
  private strokePointsWorld: Types.Point3[] = [];
  private previewPoints: Types.Point3[] = [];
  private pendingPreviewCleanup: {
    viewportId: string;
    segmentationId: string;
    listener: EventListener;
  } | null = null;

  reset(): void {
    this.strokePointsWorld = [];
    this.previewPoints = [];
  }

  clearPendingCleanup(): void {
    if (!this.pendingPreviewCleanup) {
      return;
    }

    eventTarget.removeEventListener(
      Events.SEGMENTATION_RENDERED,
      this.pendingPreviewCleanup.listener
    );
    this.pendingPreviewCleanup = null;
  }

  appendStrokePoint(worldPoint: Types.Point3): void {
    this.strokePointsWorld = appendLazyBrushStrokePoint(
      this.strokePointsWorld,
      worldPoint
    );
  }

  getStrokePointsWorld(): Types.Point3[] {
    return this.strokePointsWorld;
  }

  capturePreviewCircle(hoverData): void {
    if (!hoverData) {
      return;
    }

    const circlePoints = hoverData.brushCursor?.data?.editPoints;

    this.previewPoints = appendLazyBrushPreviewCircle(
      this.previewPoints,
      circlePoints
    );

    hoverData.brushCursor.data.handles.points = this.previewPoints;
  }

  scheduleCleanup({
    element,
    centerCanvas,
    viewportId,
    segmentationId,
    refreshCursor,
  }: {
    element: HTMLDivElement;
    centerCanvas: Types.Point2;
    viewportId: string;
    segmentationId: string;
    refreshCursor: (
      element: HTMLDivElement,
      centerCanvas: Types.Point2
    ) => void;
  }): void {
    this.clearPendingCleanup();

    const listener = ((evt: EventTypes.SegmentationRenderedEventType) => {
      const detail = evt.detail;

      if (
        detail.viewportId !== viewportId ||
        detail.segmentationId !== segmentationId
      ) {
        return;
      }

      this.clearPendingCleanup();
      this.reset();
      refreshCursor(element, centerCanvas);
    }) as EventListener;

    this.pendingPreviewCleanup = {
      viewportId,
      segmentationId,
      listener,
    };

    eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, listener);
  }
}

export default LazyBrushEditController;
