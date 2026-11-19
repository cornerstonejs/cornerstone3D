import {
  getRenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';

export async function show(
  flag: boolean,
  xs: string[],
  ys: string[],
  viewportId: string,
  imageIds: string[]
) {
  await volumeLoader.createAndCacheVolume(viewportId, { imageIds });

  await setVolumesForViewports(
    getRenderingEngine('engine'),
    [{ volumeId: viewportId }],
    flag ? xs : ys
  );
}
