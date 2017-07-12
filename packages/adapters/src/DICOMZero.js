class DICOMZero {
  constructor() {
    this.reset();
  }

  reset() {
    this.mappingLog = [];
    this.dataTransfer = undefined;
    this.unnaturalDatasets = [];
    this.datasets = [];
    this.readers = [];
    this.arrayBuffers = [];
    this.files = [];
    this.fileIndex = 0;
  }

  getReadDICOMFunction(doneCallback, statusCallback) {
    statusCallback = statusCallback || console.log;
    return progressEvent => {
      let reader = progressEvent.target;
      let arrayBuffer = reader.result;
      this.arrayBuffers.push(arrayBuffer);

      let dicomData;
      try {
        dicomData = DicomMessage.readFile(arrayBuffer);
        this.unnaturalDatasets.push(dicomData.dict);
        let dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
        dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
        this.datasets.push(dataset);
      } catch (error) {
        statusCallback("skipping non-dicom file");
      }

      let readerIndex = this.readers.indexOf(reader);
      if (readerIndex < 0) {
        reject("Logic error: Unexpected reader!");
      } else {
        this.readers.splice(readerIndex, 1); // remove the reader
      }

      if (this.fileIndex === this.dataTransfer.files.length) {
        statusCallback(`Normalizing...`);
        try {
          this.multiframe = Normalizer.normalizeToDataset(this.datasets);
        } catch (e) {
          console.error('Could not convert to multiframe');
          console.error(e);
        }
        statusCallback(`Creating segmentation...`);
        try {
          this.seg = new Segmentation([this.multiframe]);
          statusCallback(`Created ${this.multiframe.NumberOfFrames} frame multiframe object and segmentation.`);
        } catch (e) {
          console.error('Could not create segmentation');
          console.error(e);
        }
        doneCallback();
      } else {
        statusCallback(`Reading... (${this.fileIndex+1}).`);
        this.readOneFile(doneCallback, statusCallback);
      }
    };
  }

  // Used for file selection button or drop of file list
  readOneFile(doneCallback, statusCallback) {
    let file = this.dataTransfer.files[this.fileIndex];
    this.fileIndex++;

    let reader = new FileReader();
    reader.onload = this.getReadDICOMFunction(doneCallback, statusCallback);
    reader.readAsArrayBuffer(file);

    this.files.push(file);
    this.readers.push(reader);
  }
}
