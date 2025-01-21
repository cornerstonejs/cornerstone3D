import { triggerEvent, eventTarget } from '@cornerstonejs/core';
import Events from '../enums/Events';
import type { Annotation } from '../types';
import { ChangeTypes } from '../enums';

export type FramesRange = [number, number] | number;

/**
 * This class handles the annotation frame range values for multiframes.
 * Mostly used for the Video viewport, it allows references to
 * a range of frame values.
 */
export default class AnnotationFrameRange {
  protected static frameRangeExtractor =
    /(\/frames\/|[&?]frameNumber=)([^/&?]*)/i;

  protected static imageIdToFrames(imageId: string): FramesRange {
    const match = imageId.match(this.frameRangeExtractor);
    if (!match || !match[2]) {
      return null;
    }
    const range = match[2].split('-').map((it) => Number(it));
    if (range.length === 1) {
      return range[0];
    }
    return range as FramesRange;
  }

  public static framesToString(range) {
    if (Array.isArray(range)) {
      return `${range[0]}-${range[1]}`;
    }
    return String(range);
  }

  protected static framesToImageId(
    imageId: string,
    range: FramesRange | string
  ): string {
    const match = imageId.match(this.frameRangeExtractor);
    if (!match || !match[2]) {
      return null;
    }
    const newRangeString = this.framesToString(range);
    return imageId.replace(
      this.frameRangeExtractor,
      `${match[1]}${newRangeString}`
    );
  }

  public static setStartRange(
    viewport,
    annotation,
    startRange = viewport.getCurrentImageIdIndex()
  ) {
    this.setRange(viewport, annotation, startRange);
  }

  public static setEndRange(
    viewport,
    annotation,
    endRange = viewport.getCurrentImageIdIndex()
  ) {
    this.setRange(viewport, annotation, undefined, endRange);
  }

  /**
   * Sets a range of images in the current viewport to be selected.
   * This only works on stack and video viewports currently.
   */
  public static setRange(
    viewport,
    annotation,
    startRange?: number,
    endRange?: number
  ) {
    const { metadata } = annotation;

    if (startRange === undefined) {
      startRange = metadata.sliceIndex < endRange ? metadata.sliceIndex : 0;
      if (endRange === undefined) {
        endRange = viewport.getNumberOfSlices() - 1;
      }
    }
    if (endRange === undefined) {
      endRange =
        metadata.sliceRangeEnd >= startRange
          ? metadata.sliceRangeEnd
          : viewport.getNumberOfSlices() - 1;
    }
    metadata.sliceRangeEnd = Math.max(startRange, endRange);
    metadata.sliceIndex = Math.min(startRange, endRange);
    metadata.referencedImageId = viewport.getCurrentImageId(
      metadata.sliceIndex
    );
    metadata.referencedImageUri = undefined;
    if (metadata.sliceRangeEnd === metadata.sliceIndex) {
      metadata.sliceRangeEnd = undefined;
    }

    // Send an event with metadata reference modified set to true so that
    // any isReferenceViewable checks can be redone if needed.
    const eventDetail = {
      viewportId: viewport.id,
      renderingEngineId: viewport.renderingEngineId,
      changeType: ChangeTypes.MetadataReferenceModified,
      annotation,
    };

    triggerEvent(eventTarget, Events.ANNOTATION_MODIFIED, eventDetail);
    this.setViewportFrameRange(viewport, metadata);
  }

  public static setSingle(
    viewport,
    annotation,
    current = viewport.getCurrentImageIdIndex()
  ) {
    this.setRange(viewport, annotation, current, current);
  }

  public static getFrameRange(
    annotation: Annotation
  ): number | [number, number] {
    const { metadata } = annotation;
    const { sliceIndex, sliceRangeEnd } = metadata;
    return sliceRangeEnd ? [sliceIndex + 1, sliceRangeEnd + 1] : sliceIndex + 1;
  }

  public static setViewportFrameRange(viewport, specifier) {
    if (viewport.setFrameRange && specifier.sliceRangeEnd) {
      viewport.setFrameRange(specifier.sliceIndex, specifier.sliceRangeEnd);
    }
  }
}
