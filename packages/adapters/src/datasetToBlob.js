import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { DicomDict } from "./DicomDict.js";

function datasetToDict(dataset) {
    const meta = {
        FileMetaInformationVersion:
            dataset._meta.FileMetaInformationVersion.Value,
        MediaStorageSOPClassUID: dataset.SOPClassUID,
        MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
        TransferSyntaxUID: "1.2.840.10008.1.2",
        ImplementationClassUID: DicomMetaDictionary.uid(),
        ImplementationVersionName: "dcmjs-0.0"
    };

    // TODO: Clean this up later
    if (!meta.FileMetaInformationVersion) {
        meta.FileMetaInformationVersion =
            dataset._meta.FileMetaInformationVersion.Value[0];
    }

    const denaturalized = DicomMetaDictionary.denaturalizeDataset(meta);
    const dicomDict = new DicomDict(denaturalized);
    dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
    return dicomDict;
}

function datasetToBuffer(dataset) {
    return Buffer.from(datasetToDict(dataset).write());
}

function datasetToBlob(dataset) {
    const buffer = datasetToBuffer(dataset);
    return new Blob([buffer], { type: "application/dicom" });
}

export { datasetToBlob, datasetToBuffer, datasetToDict };
