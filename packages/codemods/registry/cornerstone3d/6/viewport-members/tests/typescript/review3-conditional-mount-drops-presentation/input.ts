import type { Enums, Types, VolumeViewport3D } from '@cornerstonejs/core';

export async function conditionalMount(
  viewport: Types.IStackViewport,
  imageIds: string[],
  flag: boolean
) {
  if (flag) await viewport.setStack(imageIds);
  viewport.setProperties({ invert: true });
}

export async function mountedFirst(
  viewport: Types.IStackViewport,
  imageIds: string[]
) {
  await viewport.setStack(imageIds);
  viewport.setProperties({ invert: true });
}

export function videoWithoutMount(viewport: Types.IVideoViewport) {
  viewport.setAverageWhite([255, 255, 255]);
}

export async function videoMounted(
  viewport: Types.IVideoViewport,
  imageId: string
) {
  await viewport.setVideo(imageId);
  viewport.setAverageWhite([255, 255, 255]);
}

export async function mountedThreeD(
  viewport: VolumeViewport3D,
  displaySetId: string
) {
  await viewport.setDisplaySets({ displaySetId });
  viewport.setProperties({ preset: 'CT-Bone', sampleDistanceMultiplier: 2 });
}

export async function mountedQuotedKey(
  viewport: Types.IStackViewport,
  imageIds: string[],
  mode: Enums.VOILUTFunctionType
) {
  await viewport.setStack(imageIds);
  viewport.setProperties({ 'VOILUTFunction': mode });
}

export async function mountedVideoAndEcg(
  video: Types.IVideoViewport,
  ecg: Types.IECGViewport,
  imageId: string
) {
  await video.setVideo(imageId);
  video.setProperties({ loop: true, muted: true });
  await ecg.setEcg(imageId);
  ecg.setProperties({ showAmplitudeLabels: true });
}
