import * as cornerstone from '@precisionmetrics/cornerstone-render'
import WADORSHeaderProvider from './WADORSHeaderProvider'
import ptScalingMetaDataProvider from './ptScalingMetaDataProvider'

const { calibratedPixelSpacingMetadataProvider } = cornerstone.utilities

export default function initProviders() {
  cornerstone.metaData.addProvider(
    WADORSHeaderProvider.get.bind(WADORSHeaderProvider),
    9999
  )
  cornerstone.metaData.addProvider(
    ptScalingMetaDataProvider.get.bind(ptScalingMetaDataProvider),
    10000
  )
  cornerstone.metaData.addProvider(
    calibratedPixelSpacingMetadataProvider.get.bind(
      calibratedPixelSpacingMetadataProvider
    ),
    11000
  )
}
