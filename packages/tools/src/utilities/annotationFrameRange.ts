import { triggerEvent, eventTarget } from '@cornerstonejs/core';
import Events from '../enums/Events';
import { Annotation } from '../types';

/**
 * This class handles the annotation frame range values for multiframes.
 * Mostly used for the Video viewport, it allows references to
 * a range of frame values.
 *
 */

export type FramesRange = [number, number] | number;

export default class AnnotationFrameRange {
  public static frameRangeExtractor = /(\/frames\/|[&?]frameNumber=)([^/&?]*)/i;
  public static baseUrlExtractor =
    /(videoId:|imageId:|volumeId:)?([a-zA-Z]*:)?/;

  public static imageIdToFrames(imageId: string): FramesRange {
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

  public static frameRangeToString(range) {
    if (Array.isArray(range)) {
      return `${range[0]}-${range[1]}`;
    }
    return String(range);
  }

  public static framesToImageId(
    imageId: string,
    range: FramesRange | string
  ): string {
    const match = imageId.match(this.frameRangeExtractor);
    if (!match || !match[2]) {
      return null;
    }
    const newRangeString = this.frameRangeToString(range);
    return imageId.replace(
      this.frameRangeExtractor,
      `${match[1]}${newRangeString}`
    );
  }

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

  public static annotationToFrameRange(annotation: Annotation) {
    return this.imageIdToFrames(annotation.metadata.referencedImageId);
  }

  /**
   * Returns an imageId without:
   * * Any prefixes such as imageId, videoId etc.
   * * The /frames/... part (or anything after it).
   */
  public static baseUrl(imageId: string): string {
    const match = imageId.match(this.frameRangeExtractor);
    const beforeFrames = imageId.substring(0, match?.index);
    return beforeFrames.replace(this.baseUrlExtractor, '');
  }
}
