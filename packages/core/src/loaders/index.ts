import { cornerstoneStreamingImageVolumeLoader } from './cornerstoneStreamingImageVolumeLoader';
import { cornerstoneStreamingDynamicImageVolumeLoader } from './cornerstoneStreamingDynamicImageVolumeLoader';
import * as geometryLoader from './geometryLoader';
import * as imageLoader from './imageLoader';
import * as volumeLoader from './volumeLoader';
import type { VolumeLoaderFn } from '../types';

volumeLoader.registerUnknownVolumeLoader(
  cornerstoneStreamingImageVolumeLoader as unknown as VolumeLoaderFn
);

export {
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
  geometryLoader,
  imageLoader,
  volumeLoader,
};
