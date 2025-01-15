import { triggerEvent, eventTarget } from '@cornerstonejs/core';
import Events from '../enums/Events';
import type { Annotation } from '../types';
import { ChangeTypes } from '../enums';

export type FramesRange = [number, number] | number;

/**
 * This class handles the annotation multiple selections.  There are a number of
 * methods to deal with different types of range values currently, with the idea
 * that this class can handle other types of multi select in the future.
 */
export default class AnnotationMultiSelect {
  /**
   * Sets the given annotation start slice index to the provided value (or
   * the current image index).
   */
  public static setStartRange(
    viewport,
    annotation,
    startRange = viewport.getCurrentImageIdIndex()
  ) {
    this.setRange(viewport, annotation, startRange);
  }

  /**
   * Sets the end of the range to the specified value.
   * If that is a single image, will be set as a non-range value.
   */
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

  /**
   * Sets the annotation to display a single image rather than a range of
   * images.
   */
  public static setSingle(
    viewport,
    annotation,
    current = viewport.getCurrentImageIdIndex()
  ) {
    this.setRange(viewport, annotation, current, current);
  }

  /**
   * Gets the frame range or single frame item from an annotation.
   */
  public static getFrameRange(
    annotation: Annotation
  ): number | [number, number] {
    const { metadata } = annotation;
    const { sliceIndex, sliceRangeEnd } = metadata;
    return sliceRangeEnd ? [sliceIndex + 1, sliceRangeEnd + 1] : sliceIndex + 1;
  }

  /**
   * This sets the viewport frame range if it has a frame range.  This is the
   * playback range for display.
   */
  public static setViewportFrameRange(viewport, specifier) {
    if (viewport.setFrameRange && specifier.sliceRangeEnd) {
      viewport.setFrameRange(specifier.sliceIndex, specifier.sliceRangeEnd);
    }
  }
}
