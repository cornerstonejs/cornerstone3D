import {
  getRenderingEngine,
  volumeLoader,
  displaySetRegistry,
  Enums,
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
  const viewports = (flag ? xs : ys).map((viewportId2) => {
    const viewport = renderingEngine.getViewport(viewportId2);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId2} does not exist`);
    }

    if (
      viewport.type !== Enums.ViewportType.PLANAR &&
      viewport.type !== Enums.ViewportType.VOLUME_3D
    ) {
      throw new Error(
        'setVolumesForViewports only supports viewports that implement setVolumes'
      );
    }

    return viewport;
  });

  displaySetRegistry.add(viewportId, {
    imageIds,
    volumeId: viewportId,
  });

  await Promise.all(
    viewports.map((viewport) => viewport.setDisplaySets({ displaySetId: viewportId, options: { mode: 'volume' } }))
  );
}
