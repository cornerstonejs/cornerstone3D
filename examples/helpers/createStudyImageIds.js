import config from './../config/default';
import { api } from 'dicomweb-client';
import WADORSHeaderProvider from './WADORSHeaderProvider';

const { wadoRsRoot, StudyInstanceUID } = config;

const DX_CONFIG = {
  "wadoRsRoot": "https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs",
  StudyInstanceUID: "1.3.6.1.4.1.14519.5.2.1.7009.2403.459769504433903221904322299373",
  SeriesInstanceUID: "1.3.6.1.4.1.14519.5.2.1.7009.2403.573507813194776217846035126962"
}

/**
 * Uses dicomweb-client to fetch metadata of a study, cache it in cornerstone,
 * and return a list of imageIds for the frames.
 *
 * Uses the app config to choose which study to fetch, and which
 * dicom-web server to fetch it from.
 *
 * @returns {string[]} An array of imageIds for instances in the study.
 */
export default async function createStudyImageIds() {
  const SOP_INSTANCE_UID = '00080018';
  const SERIES_INSTANCE_UID = '0020000E';

  const studySearchOptions = {
    studyInstanceUID: StudyInstanceUID,
  };

  const client = new api.DICOMwebClient({ url: wadoRsRoot });
  const instances = await client.retrieveStudyMetadata(studySearchOptions);

  const imageIds = instances.map(instanceMetaData => {
    const SeriesInstanceUID = instanceMetaData[SERIES_INSTANCE_UID].Value[0];
    const SOPInstanceUID = instanceMetaData[SOP_INSTANCE_UID].Value[0];

    const imageId =
      `csiv:` +
      wadoRsRoot +
      '/studies/' +
      StudyInstanceUID +
      '/series/' +
      SeriesInstanceUID +
      '/instances/' +
      SOPInstanceUID +
      '/frames/1';

    const colonIndex = imageId.indexOf(':')
    const wadoImageId = 'wadors' + imageId.substring(colonIndex)

    cornerstoneWADOImageLoader.wadors.metaDataManager.add(
      imageId,
      instanceMetaData
    );


    cornerstoneWADOImageLoader.wadors.metaDataManager.add(
      wadoImageId,
      instanceMetaData
    );

    WADORSHeaderProvider.addInstance(imageId, instanceMetaData);

    return imageId;
  });

  return imageIds;
}

// TODO: merge the create studies into one
export async function createDXImageIds() {
  const { wadoRsRoot } = DX_CONFIG
  const SOP_INSTANCE_UID = '00080018';
  const SERIES_INSTANCE_UID = '0020000E';

  const { StudyInstanceUID } = DX_CONFIG

  const studySearchOptions = {
    studyInstanceUID: StudyInstanceUID,
    seriesInstanceUID: DX_CONFIG.SeriesInstanceUID,
  };

  const client = new api.DICOMwebClient({ url: wadoRsRoot });
  const instances = await client.retrieveSeriesMetadata(studySearchOptions);
  const imageIds = instances.map(instanceMetaData => {
    const SeriesInstanceUID = instanceMetaData[SERIES_INSTANCE_UID].Value[0];
    const SOPInstanceUID = instanceMetaData[SOP_INSTANCE_UID].Value[0];

    const imageId =
      `wadors:` +
      wadoRsRoot +
      '/studies/' +
      StudyInstanceUID +
      '/series/' +
      SeriesInstanceUID +
      '/instances/' +
      SOPInstanceUID +
      '/frames/1';


    cornerstoneWADOImageLoader.wadors.metaDataManager.add(
      imageId,
      instanceMetaData
    );

    return imageId;
  });

  return imageIds;
}
