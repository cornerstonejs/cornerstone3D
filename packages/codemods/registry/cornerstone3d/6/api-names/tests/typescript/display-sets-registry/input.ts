import * as cs from '@cornerstonejs/core';
import { Enums, RenderingEngine, utilities } from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

const provider = utilities.genericViewportDisplaySetMetadataProvider;

export async function showStack(
  engine: RenderingEngine,
  imageIds: string[],
  volumeId: string
) {
  const viewport = engine.getViewport<PlanarViewport>('CT');

  utilities.genericViewportDisplaySetMetadataProvider.add('ct', {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 0,
  });
  provider.add('ct-volume', { imageIds, kind: 'planar', volumeId });
  await viewport.setDisplaySets({ displaySetId: 'ct' });

  return provider.get(provider.VIEWPORT_V2_DISPLAY_SET, 'ct');
}

export function showVideo(videoImageId: string, ecgImageId: string) {
  const descriptor = { kind: 'video', sourceDataId: videoImageId };

  cs.utilities.genericViewportDisplaySetMetadataProvider.add(
    'video',
    descriptor
  );
  cs.utilities.genericViewportDisplaySetMetadataProvider.add('ecg', {
    kind: 'ecg',
    sourceDataId: ecgImageId,
  });
  cs.utilities.genericViewportDisplaySetMetadataProvider.add(
    'ecg-by-id',
    ecgImageId
  );
  cs.utilities.genericViewportDisplaySetMetadataProvider.add('series', [
    'wadors:1',
    'wadors:2',
  ]);

  return cs.utilities.genericViewportDisplaySetMetadataProvider.get(
    'genericViewportDisplaySet',
    'video'
  );
}

export function forget(displaySetId: string) {
  const { genericViewportDisplaySetMetadataProvider: registry } = utilities;

  registry.remove(displaySetId);

  return registry.has(displaySetId) || Enums.ViewportType.PLANAR;
}
