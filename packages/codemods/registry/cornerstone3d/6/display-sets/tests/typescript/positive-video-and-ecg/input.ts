import type { ECGViewport, VideoViewport } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

async function show(videoImageId: string, ecgImageId: string) {
  const engine = getRenderingEngine('engine');
  const videoViewport = engine.getViewport<VideoViewport>('video');
  const ecgViewport = engine.getViewport<ECGViewport>('ecg');

  await videoViewport.setVideo(videoImageId, 1);
  await ecgViewport.setEcg(ecgImageId);

  return videoViewport.setVideo(videoImageId);
}

show('video', 'ecg');
