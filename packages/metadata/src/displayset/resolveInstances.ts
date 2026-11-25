import type { NaturalizedInstance } from './types';

export type ResolveInstancesOptions = {
  /** When true, skip missing ids silently; otherwise they are omitted with optional warn. */
  skipMissing?: boolean;
  onMissing?: (imageId: string) => void;
};

/**
 * Resolves imageIds to naturalized instances in input order.
 */
export function resolveInstances(
  imageIds: string[],
  getNaturalizedInstance: (imageId: string) => NaturalizedInstance | undefined,
  options: ResolveInstancesOptions = {}
): NaturalizedInstance[] {
  const { skipMissing = true, onMissing } = options;
  const instances: NaturalizedInstance[] = [];

  for (const imageId of imageIds) {
    const instance = getNaturalizedInstance(imageId);
    if (!instance) {
      if (!skipMissing) {
        throw new Error(`No naturalized instance for imageId: ${imageId}`);
      }
      onMissing?.(imageId);
      continue;
    }
    instances.push(instance);
  }

  return instances;
}
