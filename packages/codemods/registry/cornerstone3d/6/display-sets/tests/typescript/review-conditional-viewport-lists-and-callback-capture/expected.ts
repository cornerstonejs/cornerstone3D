import {
  getRenderingEngine,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';

export async function show(
  flag: boolean,
  xs: string[],
  ys: string[],
  viewportId: string,
  imageIds: string[]
) {
  await volumeLoader.createAndCacheVolume(viewportId, { imageIds });

  const renderingEngine = getRenderingEngine('engine');
  utilities.genericViewportDisplaySetMetadataProvider.add(viewportId, {
    kind: 'planar',
    imageIds,
    volumeId: viewportId,
  });

  await Promise.all(
    (flag ? xs : ys).map((viewportId2) =>
      renderingEngine.getViewport(viewportId2).setDisplaySets({ displaySetId: viewportId })
    )
  );
}
