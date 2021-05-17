import config from "./../config/default";
import { api } from "dicomweb-client";
import WADORSHeaderProvider from "./WADORSHeaderProvider";



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
  type,
}) {
  const { wadoRsRoot } = config;

  const SOP_INSTANCE_UID = "00080018";
  const SERIES_INSTANCE_UID = "0020000E";

  const studySearchOptions = {
    studyInstanceUID: StudyInstanceUID,
    seriesInstanceUID: SeriesInstanceUID,
  };

  const client = new api.DICOMwebClient({ url: wadoRsRoot });
  const instances = await client.retrieveSeriesMetadata(studySearchOptions);
  const imageIds = instances.map((instanceMetaData) => {
    const SeriesInstanceUID = instanceMetaData[SERIES_INSTANCE_UID].Value[0];
    const SOPInstanceUID = instanceMetaData[SOP_INSTANCE_UID].Value[0];

    let imageId;
    if (type === VOLUME) {
      imageId =
        `csiv:` +
        wadoRsRoot +
        "/studies/" +
        StudyInstanceUID +
        "/series/" +
        SeriesInstanceUID +
        "/instances/" +
        SOPInstanceUID +
        "/frames/1";

      cornerstoneWADOImageLoader.wadors.metaDataManager.add(
        imageId,
        instanceMetaData
      );

      WADORSHeaderProvider.addInstance(imageId, instanceMetaData);

    } else {
      imageId =
        `wadors:` +
        wadoRsRoot +
        "/studies/" +
        StudyInstanceUID +
        "/series/" +
        SeriesInstanceUID +
        "/instances/" +
        SOPInstanceUID +
        "/frames/1";

      cornerstoneWADOImageLoader.wadors.metaDataManager.add(
        imageId,
        instanceMetaData
      );
    }

    return imageId;
  });

  return imageIds;
}
