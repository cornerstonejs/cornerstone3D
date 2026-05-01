import * as cornerstone from '@cornerstonejs/core';
import { registerDefaultProviders } from '@cornerstonejs/metadata';
import ptScalingMetaDataProvider from './ptScalingMetaDataProvider';

const { calibratedPixelSpacingMetadataProvider } = cornerstone.utilities;

export default function initProviders() {
  // Register the typed metadata provider chain (tagModules, cache, instance bridge, etc.)
  registerDefaultProviders();

  cornerstone.metaData.addProvider(
    ptScalingMetaDataProvider.get.bind(ptScalingMetaDataProvider),
    10000
  );
  cornerstone.metaData.addProvider(
    calibratedPixelSpacingMetadataProvider.get.bind(
      calibratedPixelSpacingMetadataProvider
    ),
    11000
  );
}
