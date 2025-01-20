import { triggerEvent, eventTarget } from '@cornerstonejs/core';
import Events from '../enums/Events';
import type { Annotation } from '../types';
import { ChangeTypes } from '../enums';

export type FramesRange = [number, number] | number;

/**
 * This class handles the annotation multiple slice view references.
 * Currently this only manages range values within a single stack, however,
 * the intent is to support both range and multiple stack/multi slice indices.
 */
export default class AnnotationMultiSlice {
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
    const rangeEndSliceIndex = viewport.getSliceIndexForImage(
      metadata.multiSliceReference
    );

    if (endRange === undefined) {
      endRange =
        rangeEndSliceIndex >= startRange
          ? rangeEndSliceIndex
          : viewport.getNumberOfSlices() - 1;
    }
    endRange = Math.max(startRange, endRange);
    metadata.sliceIndex = Math.min(startRange, endRange);
    metadata.referencedImageId = viewport.getCurrentImageId(
      metadata.sliceIndex
    );
    metadata.referencedImageURI = undefined;
    if (endRange === metadata.sliceIndex) {
      metadata.multiSliceReference = undefined;
    } else if (endRange !== metadata.multiSliceReference?.sliceIndex) {
      metadata.multiSliceReference = {
        referencedImageId: viewport.getCurrentImageId(endRange),
        sliceIndex: endRange,
      };
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
    const { sliceIndex, multiSliceReference } = metadata;
    const rangeEndSliceIndex = multiSliceReference?.sliceIndex;
    return rangeEndSliceIndex
      ? [sliceIndex + 1, rangeEndSliceIndex + 1]
      : sliceIndex + 1;
  }

  public static getFrameRangeStr(annotation: Annotation) {
    const range = this.getFrameRange(annotation);
    return Array.isArray(range) ? `${range[0]}-${range[1]}` : String(range);
  }

  /**
   * This sets the viewport frame range if it has a frame range.  This is the
   * playback range for display.
   */
  public static setViewportFrameRange(viewport, specifier) {
    if (viewport.setFrameRange && specifier.multiSliceReference?.sliceIndex) {
      viewport.setFrameRange(
        specifier.sliceIndex + 1,
        specifier.multiSliceReference.sliceIndex + 1
      );
    }
  }
}
