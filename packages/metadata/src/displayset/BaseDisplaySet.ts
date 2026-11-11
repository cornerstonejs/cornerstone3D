import type { IDisplaySet } from './IDisplaySet';
import type { NaturalizedInstance } from './types';

export type BaseDisplaySetOptions = {
  displaySetId: string;
  instances?: NaturalizedInstance[];
  imageIds?: Iterable<string>;
  underlyingImageIds?: Iterable<string>;
  /** False for an object nothing can render (the `unsupported` handler). */
  isDisplayable?: boolean;
};

/**
 * Base display set metadata exposing the common {@link IDisplaySet} attributes.
 * Attributes are computed once at construction (see IDisplaySet for the
 * data-attribute rationale and the extension pattern for additional attributes).
 */
export class BaseDisplaySet implements IDisplaySet {
  displaySetId: string;
  isDisplayable: boolean;
  readonly instances: readonly NaturalizedInstance[];
  readonly imageIds: readonly string[];
  readonly underlyingImageIds: readonly string[];

  constructor(options: BaseDisplaySetOptions) {
    this.displaySetId = options.displaySetId;
    this.isDisplayable = options.isDisplayable ?? true;
    this.instances = [...(options.instances ?? [])];
    // Preserve caller cardinality/order: IDisplaySet documents
    // underlyingImageIds as one entry per instance, so deduping could drop a
    // legitimate frame-to-instance mapping.
    this.imageIds = [...(options.imageIds ?? [])];
    this.underlyingImageIds = [...(options.underlyingImageIds ?? [])];
  }
}
