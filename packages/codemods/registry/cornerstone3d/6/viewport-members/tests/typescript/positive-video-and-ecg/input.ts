import type { ECGViewport, VideoViewport } from '@cornerstonejs/core';

function update(videoViewport: VideoViewport, ecgViewport: ECGViewport) {
  videoViewport.setFrameRange([5, 10]);
  videoViewport.setAverageWhite([255, 255, 255]);
  videoViewport.setProperties({ loop: true, muted: true });

  ecgViewport.setProperties({ visibleChannels: [0, 1], layoutType: 'grid' });
  ecgViewport.setProperties({ showAmplitudeLabels: true });
  ecgViewport.resetCamera();

  return [videoViewport.fps, videoViewport.numberOfFrames, videoViewport.uid];
}

console.log(update);
