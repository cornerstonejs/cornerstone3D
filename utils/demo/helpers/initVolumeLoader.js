import { imageLoader, volumeLoader } from '@cornerstonejs/core';
import { cornerstoneStreamingImageVolumeLoader } from '@cornerstonejs/streaming-image-volume-loader';

export default function initVolumeLoader() {
  volumeLoader.registerUnknownVolumeLoader(
    cornerstoneStreamingImageVolumeLoader
  );
  volumeLoader.registerVolumeLoader(
    'cornerstoneStreamingImageVolume',
    cornerstoneStreamingImageVolumeLoader
  );
}
