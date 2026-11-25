import * as cs from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

const provider = cs.displaySetRegistry;

export async function showStack(
  engine: RenderingEngine,
  imageIds: string[],
  volumeId: string
) {
  const viewport = engine.getViewport<PlanarViewport>('CT');

  cs.displaySetRegistry.add('ct', {
    imageIds,
  });
  provider.add('ct-volume', { imageIds, volumeId });
  await viewport.setDisplaySets({ displaySetId: 'ct', options: { initialImageIdIndex: 0 } });

  return provider.get('ct');
}

export function showVideo(videoImageId: string, ecgImageId: string) {
  const descriptor = { imageId: videoImageId };

  cs.displaySetRegistry.add(
    'video',
    descriptor
  );
  cs.displaySetRegistry.add('ecg', {
    imageId: ecgImageId,
  });
  cs.displaySetRegistry.add(
    'ecg-by-id',
    ecgImageId
  );
  cs.displaySetRegistry.add('series', { imageIds: [
    'wadors:1',
    'wadors:2',
  ] });

  return cs.displaySetRegistry.get(
    'video'
  );
}

export function forget(displaySetId: string) {
  cs.displaySetRegistry.remove(displaySetId);

  return cs.displaySetRegistry.has(displaySetId) || Enums.ViewportType.PLANAR;
}
