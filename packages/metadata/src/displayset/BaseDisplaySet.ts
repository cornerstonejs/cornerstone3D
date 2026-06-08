import type { IDisplaySet } from './IDisplaySet';
import type { NaturalizedInstance, ViewportTypeHint } from './types';
import { getPreferredViewportType } from './viewportTypes';

export type BaseDisplaySetOptions = {
  displaySetInstanceUID: string;
  viewportTypes?: readonly ViewportTypeHint[];
  instances?: NaturalizedInstance[];
  imageIds?: Iterable<string>;
  underlyingImageIds?: Iterable<string>;
};

/**
 * Base display set metadata exposing the common {@link IDisplaySet} attributes.
 * Attributes are computed once at construction (see IDisplaySet for the
 * data-attribute rationale and the extension pattern for additional attributes).
 */
export class BaseDisplaySet implements IDisplaySet {
  displaySetInstanceUID: string;
  viewportTypes: readonly ViewportTypeHint[];
  preferredViewportType: ViewportTypeHint;
  readonly instances: readonly NaturalizedInstance[];
  readonly imageIds: readonly string[];
  readonly underlyingImageIds: readonly string[];

  constructor(options: BaseDisplaySetOptions) {
    this.displaySetInstanceUID = options.displaySetInstanceUID;
    this.viewportTypes = options.viewportTypes?.length
      ? options.viewportTypes
      : ['stack'];
    this.preferredViewportType = getPreferredViewportType(this.viewportTypes);
    this.instances = options.instances ?? [];
    this.imageIds = [...new Set(options.imageIds ?? [])];
    this.underlyingImageIds = [...new Set(options.underlyingImageIds ?? [])];
  }
}
