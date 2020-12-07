import dcmjs from 'dcmjs';

const metadataHeadersPerImageId = {};
const INSTANCE = 'instance';

function addInstance(imageId, dicomJSONDatasetOrP10ArrayBuffer) {
  let dicomJSONDataset;

  // If Arraybuffer, parse to DICOMJSON before naturalizing.
  if (dicomJSONDatasetOrP10ArrayBuffer instanceof ArrayBuffer) {
    const dicomData = DicomMessage.readFile(dicomJSONDatasetOrP10ArrayBuffer);

    dicomJSONDataset = dicomData.dict;
  } else {
    dicomJSONDataset = dicomJSONDatasetOrP10ArrayBuffer;
  }

  // Check if dataset is already naturalized.

  let naturalizedDataset;

  if (dicomJSONDataset['SeriesInstanceUID'] === undefined) {
    naturalizedDataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
      dicomJSONDataset
    );
  } else {
    naturalizedDataset = dicomJSONDataset;
  }

  metadataHeadersPerImageId[imageId] = naturalizedDataset;
}

function get(query, imageId) {
  if (query === INSTANCE) {
    return metadataHeadersPerImageId[imageId];
  }
}

export default { addInstance, get };
