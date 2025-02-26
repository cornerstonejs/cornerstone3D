import { triggerEvent, eventTarget } from '@cornerstonejs/core';

export type FramesRange = [number, number] | number;

/**
 * This class handles the annotation frame range values for multiframes.
 * Mostly used for the Video viewport, it allows references to
 * a range of frame values.
 */
export default class FrameRangeUtils {
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

  public static multiframeImageId(imageId: string, frameNumber = 1) {
    const match = imageId.match(this.frameRangeExtractor);
    if (!match || !match[2]) {
      console.warn('Unable to extract frame from', imageId);
      return imageId;
    }
    return imageId;
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
}
