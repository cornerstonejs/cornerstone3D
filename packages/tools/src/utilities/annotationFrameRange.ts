import { triggerEvent, eventTarget } from '@cornerstonejs/core';
import Events from '../enums/Events';
import { Annotation } from '../types';

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

  /**
   * Sets the range of frames to associate with the given annotation.
   * The range can be a single frame number (1 based according to DICOM),
   * or a range of values in the format `min-max` where min, max are inclusive
   * Modifies the referencedImageID to specify the updated URL.
   */
  public static setFrameRange(
    annotation: Annotation,
    range: FramesRange | string,
    eventBase?: { viewportId; renderingEngineId }
  ) {
    const { referencedImageId } = annotation.metadata;
    annotation.metadata.referencedImageId = this.framesToImageId(
      referencedImageId,
      range
    );
    const eventDetail = {
      ...eventBase,
      annotation,
    };
    triggerEvent(eventTarget, Events.ANNOTATION_MODIFIED, eventDetail);
  }

  public static getFrameRange(
    annotation: Annotation
  ): number | [number, number] {
    return this.imageIdToFrames(annotation.metadata.referencedImageId);
  }
}
