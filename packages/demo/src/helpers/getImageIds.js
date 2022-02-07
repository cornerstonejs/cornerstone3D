import createImageIdsAndCacheMetaData from './createImageIdsAndCacheMetaData'
import config from './../config/default'

/**
 * Get the imageIds by passing the StudyInstanceUID, SeriesInstanceUID and type
 * to the
 *
 * @returns {Array} Array of imageIds
 */
export default async function getImageIds(studyId, type, callback, codec) {
  const study = config[studyId]
  let wadoRsRoot = study.wadoRsRoot

  if (codec){
    wadoRsRoot = wadoRsRoot + '/' + codec
  }

  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: study.StudyInstanceUID,
    SeriesInstanceUID: study.SeriesInstanceUID,
    wadoRsRoot,
    type,
  })

  if (callback) {
    imageIds = callback(imageIds)
  }

  return imageIds
}
