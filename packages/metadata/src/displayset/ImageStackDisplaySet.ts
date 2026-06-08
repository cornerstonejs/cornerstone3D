import { BaseDisplaySet, type BaseDisplaySetOptions } from './BaseDisplaySet';
import type { NaturalizedInstance, ViewportTypeHint } from './types';

export type ImageStackDisplaySetOptions = Omit<
  BaseDisplaySetOptions,
  'frameImageIds' | 'underlyingImageIds'
> & {
  instances?: NaturalizedInstance[];
  frameImageIds?: Iterable<string>;
  underlyingImageIds?: Iterable<string>;
};

function collectUnderlyingImageIds(instances: NaturalizedInstance[]): string[] {
  const ids: string[] = [];
  for (const instance of instances) {
    if (instance.imageId) {
      ids.push(instance.imageId);
    }
  }
  return ids;
}

function collectFrameImageIds(
  instances: NaturalizedInstance[],
  underlyingImageIds: string[]
): string[] {
  const frameIds: string[] = [];
  for (const instance of instances) {
    if (instance.imageId) {
      frameIds.push(instance.imageId);
    }
  }
  if (frameIds.length === 0) {
    return [...underlyingImageIds];
  }
  return frameIds;
}

/**
 * Image/stack display set metadata with underlying vs frame image id semantics.
 */
export class ImageStackDisplaySet extends BaseDisplaySet {
  protected readonly instances: NaturalizedInstance[];
  isMultiFrame: boolean;

  constructor(options: ImageStackDisplaySetOptions) {
    const instances = options.instances ?? [];
    const underlyingImageIds =
      options.underlyingImageIds ?? collectUnderlyingImageIds(instances);
    const underlyingList = [...underlyingImageIds];
    const frameImageIds =
      options.frameImageIds ?? collectFrameImageIds(instances, underlyingList);

    super({
      ...options,
      frameImageIds,
      underlyingImageIds: underlyingList,
    });
    this.instances = instances;
    this.isMultiFrame = instances.some(
      (instance) => Number(instance.NumberOfFrames) > 1
    );
  }

  getInstances(): readonly NaturalizedInstance[] {
    return this.instances;
  }

  static fromInstances(
    instances: NaturalizedInstance[],
    options?: {
      displaySetInstanceUID?: string;
      viewportTypes?: readonly ViewportTypeHint[];
      frameImageIds?: Iterable<string>;
    }
  ): ImageStackDisplaySet {
    const displaySetInstanceUID =
      options?.displaySetInstanceUID ??
      instances[0]?.SeriesInstanceUID ??
      `display-set-${instances[0]?.imageId ?? 'unknown'}`;

    return new ImageStackDisplaySet({
      displaySetInstanceUID,
      viewportTypes: options?.viewportTypes ?? ['stack', 'volume', 'volume3d'],
      instances,
      frameImageIds: options?.frameImageIds,
    });
  }

  static fromImageIds(
    imageIds: string[],
    getNaturalizedInstance: (
      imageId: string
    ) => NaturalizedInstance | undefined,
    options?: {
      displaySetInstanceUID?: string;
      viewportTypes?: readonly ViewportTypeHint[];
    }
  ): ImageStackDisplaySet {
    const instances = imageIds
      .map((imageId) => getNaturalizedInstance(imageId))
      .filter(
        (instance): instance is NaturalizedInstance => instance !== undefined
      );

    return ImageStackDisplaySet.fromInstances(instances, options);
  }
}
