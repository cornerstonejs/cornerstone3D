import { BaseDisplaySet, type BaseDisplaySetOptions } from './BaseDisplaySet';
import type { NaturalizedInstance, ViewportTypeHint } from './types';

export type ImageStackDisplaySetOptions = Omit<
  BaseDisplaySetOptions,
  'imageIds' | 'underlyingImageIds'
> & {
  instances?: NaturalizedInstance[];
  imageIds?: Iterable<string>;
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

function collectImageIds(
  instances: NaturalizedInstance[],
  underlyingImageIds: string[]
): string[] {
  const imageIds: string[] = [];
  for (const instance of instances) {
    if (instance.imageId) {
      imageIds.push(instance.imageId);
    }
  }
  if (imageIds.length === 0) {
    return [...underlyingImageIds];
  }
  return imageIds;
}

/**
 * Image/stack display set metadata with underlying vs frame image id semantics.
 */
export class ImageStackDisplaySet extends BaseDisplaySet {
  isMultiFrame: boolean;

  constructor(options: ImageStackDisplaySetOptions) {
    const instances = options.instances ?? [];
    const underlyingImageIds =
      options.underlyingImageIds ?? collectUnderlyingImageIds(instances);
    const underlyingList = [...underlyingImageIds];
    const imageIds =
      options.imageIds ?? collectImageIds(instances, underlyingList);

    super({
      ...options,
      instances,
      imageIds,
      underlyingImageIds: underlyingList,
    });
    this.isMultiFrame = instances.some(
      (instance) => Number(instance.NumberOfFrames) > 1
    );
  }

  static fromInstances(
    instances: NaturalizedInstance[],
    options?: {
      displaySetId?: string;
      viewportTypes?: readonly ViewportTypeHint[];
      imageIds?: Iterable<string>;
    }
  ): ImageStackDisplaySet {
    const displaySetId =
      options?.displaySetId ??
      instances[0]?.SeriesInstanceUID ??
      `display-set-${instances[0]?.imageId ?? 'unknown'}`;

    return new ImageStackDisplaySet({
      displaySetId,
      viewportTypes: options?.viewportTypes ?? ['stack', 'volume', 'volume3d'],
      instances,
      imageIds: options?.imageIds,
    });
  }

  static fromImageIds(
    imageIds: string[],
    getNaturalizedInstance: (
      imageId: string
    ) => NaturalizedInstance | undefined,
    options?: {
      displaySetId?: string;
      viewportTypes?: readonly ViewportTypeHint[];
    }
  ): ImageStackDisplaySet {
    const instances = imageIds
      .map((imageId) => getNaturalizedInstance(imageId))
      .filter(
        (instance): instance is NaturalizedInstance => instance !== undefined
      );

    return ImageStackDisplaySet.fromInstances(instances, {
      ...options,
      imageIds,
    });
  }
}
