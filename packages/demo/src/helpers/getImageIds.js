import createImageIdsAndCacheMetaData from "./createImageIdsAndCacheMetaData";
import config from "./../config/default";


/**
 * Get the imageIds by passing the StudyInstanceUID, SeriesInstanceUID and type
 * to the
 *
 * @returns {Array} Array of imageIds
 */
export default async function getImageIds(studyId, type, callback) {
  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: config[studyId].StudyInstanceUID,
    SeriesInstanceUID: config[studyId].SeriesInstanceUID,
    type
  })

  if (callback) {
    imageIds = callback(imageIds)
  }

  return imageIds

}
