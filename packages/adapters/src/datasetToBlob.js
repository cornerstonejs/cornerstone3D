import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { DicomDict } from "./DicomDict.js";

function datasetToDict(dataset, transferSyntaxUID = "1.2.840.10008.1.2.1") {
    const fileMetaInformationVersionArray = new Uint8Array(2);
    fileMetaInformationVersionArray[1] = 1;
    dataset._meta = {
        MediaStorageSOPClassUID: dataset.SOPClassUID,
        MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
        ImplementationVersionName: "dcmjs-0.0",
        TransferSyntaxUID: transferSyntaxUID,
        ImplementationClassUID:
            "2.25.80302813137786398554742050926734630921603366648225212145404",
        FileMetaInformationVersion: fileMetaInformationVersionArray.buffer
    };

    const denaturalized = DicomMetaDictionary.denaturalizeDataset(
        dataset._meta
    );
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
