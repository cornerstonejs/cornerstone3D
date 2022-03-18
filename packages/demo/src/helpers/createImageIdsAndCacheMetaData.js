import { api } from 'dicomweb-client'
import dcmjs from 'dcmjs'
import { calculateSUVScalingFactors } from '@precisionmetrics/calculate-suv'
import { getPTImageIdInstanceMetadata } from './getPTImageIdInstanceMetadata'
import { utilities } from '@precisionmetrics/cornerstone-render'

import WADORSHeaderProvider from './WADORSHeaderProvider'
import ptScalingMetaDataProvider from './ptScalingMetaDataProvider'
import getPixelSpacingInformation from './getPixelSpacingInformation'

const { DicomMetaDictionary } = dcmjs.data
const { calibratedPixelSpacingMetadataProvider } = utilities

const VOLUME = 'volume'
const STACK = 'stack'

/**
 * Uses dicomweb-client to fetch metadata of a study, cache it in cornerstone,
 * and return a list of imageIds for the frames.
 *
 * Uses the app config to choose which study to fetch, and which
 * dicom-web server to fetch it from.
 *
 * @returns {string[]} An array of imageIds for instances in the study.
 */

export default async function createImageIdsAndCacheMetaData({
  StudyInstanceUID,
  SeriesInstanceUID,
  wadoRsRoot,
  type,
}) {
  const SOP_INSTANCE_UID = '00080018'
  const SERIES_INSTANCE_UID = '0020000E'
  const MODALITY = '00080060'

  const studySearchOptions = {
    studyInstanceUID: StudyInstanceUID,
    seriesInstanceUID: SeriesInstanceUID,
  }

  const client = new api.DICOMwebClient({ url: wadoRsRoot })
  const instances = await client.retrieveSeriesMetadata(studySearchOptions)
  const modality = instances[0][MODALITY].Value[0]

  const imageIds = instances.map((instanceMetaData) => {
    const SeriesInstanceUID = instanceMetaData[SERIES_INSTANCE_UID].Value[0]
    const SOPInstanceUID = instanceMetaData[SOP_INSTANCE_UID].Value[0]

    let imageId
    if (type === VOLUME) {
      imageId =
        `csiv:` +
        wadoRsRoot +
        '/studies/' +
        StudyInstanceUID +
        '/series/' +
        SeriesInstanceUID +
        '/instances/' +
        SOPInstanceUID +
        '/frames/1'

      cornerstoneWADOImageLoader.wadors.metaDataManager.add(
        imageId,
        instanceMetaData
      )
    } else {
      imageId =
        `wadors:` +
        wadoRsRoot +
        '/studies/' +
        StudyInstanceUID +
        '/series/' +
        SeriesInstanceUID +
        '/instances/' +
        SOPInstanceUID +
        '/frames/1'

      cornerstoneWADOImageLoader.wadors.metaDataManager.add(
        imageId,
        instanceMetaData
      )
    }
    WADORSHeaderProvider.addInstance(imageId, instanceMetaData)

    // Add calibrated pixel spacing
    const m = JSON.parse(JSON.stringify(instanceMetaData))
    const instance = DicomMetaDictionary.naturalizeDataset(m)
    const pixelSpacing = getPixelSpacingInformation(instance)

    calibratedPixelSpacingMetadataProvider.add(
      imageId,
      pixelSpacing.map((s) => parseFloat(s))
    )

    return imageId
  })

  // we don't want to add non-pet
  // Note: for 99% of scanners SUV calculation is consistent bw slices
  if (modality === 'PT') {
    const InstanceMetadataArray = []
    imageIds.forEach((imageId) => {
      const instanceMetadata = getPTImageIdInstanceMetadata(imageId)
      if (instanceMetadata) {
        InstanceMetadataArray.push(instanceMetadata)
      }
    })
    if (InstanceMetadataArray.length) {
      const suvScalingFactors = calculateSUVScalingFactors(
        InstanceMetadataArray
      )
      InstanceMetadataArray.forEach((instanceMetadata, index) => {
        ptScalingMetaDataProvider.addInstance(
          imageIds[index],
          suvScalingFactors[index]
        )
      })
    }
  }

  return imageIds
}
