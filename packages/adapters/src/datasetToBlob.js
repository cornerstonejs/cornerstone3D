datasetToBlob = function (dataset) {
  const meta = {
    FileMetaInformationVersion: dataset._meta.FileMetaInformationVersion.Value[0],
    MediaStorageSOPClass: dataset.SOPClass,
    MediaStorageSOPInstance: dataset.SOPInstanceUID,
    TransferSyntaxUID: "1.2.840.10008.1.2",
    ImplementationClassUID: DicomMetaDictionary.uid(),
    ImplementationVersionName: "DICOMzero-0.0",
  };

  const denaturalized = DicomMetaDictionary.denaturalizeDataset(meta);
  const dicomDict = new DicomDict(denaturalized);

  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);

  const buffer = dicomDict.write();
  return new Blob([buffer], {type: "application/dicom"});
}