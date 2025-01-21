export type FramesRange = [number, number] | number;

/**
 * This class handles the annotation frame range values for multiframes.
 * Mostly used for the Video viewport, it allows references to
 * a range of frame values.
 */
export default class FrameRange {
  protected static frameRangeExtractor =
    /(\/frames\/|[&?]frameNumber=)([^/&?]*)/i;

  /**
   * This method will extract a single frame number or range of frame numbers
   * from a multiframe image id containing a frame range.
   */
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

  public static imageIdToFrameEnd(imageId: string): number {
    const range = this.imageIdToFrames(imageId);
    return Array.isArray(range) ? range[1] : range;
  }

  public static imageIdToFrameStart(imageId: string): number {
    const range = this.imageIdToFrames(imageId);
    return Array.isArray(range) ? range[0] : range;
  }

  /**
   * @returns A string range or single value representation of a range array
   *    or single instance image.
   */
  public static framesToString(range) {
    if (Array.isArray(range)) {
      return `${range[0]}-${range[1]}`;
    }
    return String(range);
  }

  /** Applies the range string to the given image id as a frame range. */
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
