import type { IDisplaySet } from './IDisplaySet';
import type { ViewportTypeHint } from './types';
import { getPreferredViewportType } from './viewportTypes';

export type BaseDisplaySetOptions = {
  displaySetInstanceUID: string;
  viewportTypes?: readonly ViewportTypeHint[];
  frameImageIds?: Iterable<string>;
  underlyingImageIds?: Iterable<string>;
};

/**
 * Base display set metadata with frame-level and underlying image id sets.
 */
export class BaseDisplaySet implements IDisplaySet {
  displaySetInstanceUID: string;
  viewportTypes: readonly ViewportTypeHint[];

  protected readonly frameImageIdSet: Set<string>;
  protected readonly underlyingImageIdSet: Set<string>;

  constructor(options: BaseDisplaySetOptions) {
    this.displaySetInstanceUID = options.displaySetInstanceUID;
    this.viewportTypes = options.viewportTypes?.length
      ? options.viewportTypes
      : ['stack'];
    this.frameImageIdSet = new Set(options.frameImageIds ?? []);
    this.underlyingImageIdSet = new Set(options.underlyingImageIds ?? []);
  }

  getPreferredViewportType(): ViewportTypeHint {
    return getPreferredViewportType(this.viewportTypes);
  }

  getFrameImageIds(): ReadonlySet<string> {
    return this.frameImageIdSet;
  }

  getUnderlyingImageIds(): ReadonlySet<string> {
    return this.underlyingImageIdSet;
  }

  addFrameImageId(imageId: string): void {
    if (imageId) {
      this.frameImageIdSet.add(imageId);
    }
  }

  addUnderlyingImageId(imageId: string): void {
    if (imageId) {
      this.underlyingImageIdSet.add(imageId);
    }
  }

  setFrameImageIds(imageIds: Iterable<string>): void {
    this.frameImageIdSet.clear();
    for (const imageId of imageIds) {
      this.addFrameImageId(imageId);
    }
  }

  setUnderlyingImageIds(imageIds: Iterable<string>): void {
    this.underlyingImageIdSet.clear();
    for (const imageId of imageIds) {
      this.addUnderlyingImageId(imageId);
    }
  }
}
