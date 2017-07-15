import { DicomMetaDictionary } from './DicomMetaDictionary.js';
import { DicomDict } from './DicomMessage.js';

function datasetToBlob (dataset) {
  const meta = {
    FileMetaInformationVersion: dataset._meta.FileMetaInformationVersion.Value[0],
    MediaStorageSOPClassUID: dataset.SOPClassUID,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: "1.2.840.10008.1.2",
    ImplementationClassUID: DicomMetaDictionary.uid(),
    ImplementationVersionName: "dcmjs-0.0",
  };

  const denaturalized = DicomMetaDictionary.denaturalizeDataset(meta);
  const dicomDict = new DicomDict(denaturalized);

  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);

  const buffer = dicomDict.write();
  return new Blob([buffer], {type: "application/dicom"});
}

export { datasetToBlob };
