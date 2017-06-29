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

  getReadDICOMFunction(doneCallback) {
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
        console.log("skipping non-dicom file");
      }

      let readerIndex = this.readers.indexOf(reader);
      if (readerIndex < 0) {
        reject("Logic error: Unexpected reader!");
      } else {
        this.readers.splice(readerIndex, 1); // remove the reader
      }

      if (this.fileIndex === this.dataTransfer.files.length) {
        console.log(`Normalizing...`);
        this.multiframe = Normalizer.normalizeToDataset(this.datasets);
        console.log(`Creating segmentation...`);
        this.seg = new Segmentation([this.multiframe]);
        console.log(`Created ${this.multiframe.NumberOfFrames} frame multiframe object and segmentation.`);

        doneCallback();
      } else {
        console.log(`Reading... (${this.fileIndex+1}).`);
        this.readOneFile(doneCallback);
      }
    };
  }

  // Used for file selection button or drop of file list
  readOneFile(doneCallback) {
    let file = this.dataTransfer.files[this.fileIndex];
    this.fileIndex++;

    let reader = new FileReader();
    reader.onload = this.getReadDICOMFunction(doneCallback);
    reader.readAsArrayBuffer(file);

    this.files.push(file);
    this.readers.push(reader);
  }
}
