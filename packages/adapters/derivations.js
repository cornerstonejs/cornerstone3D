class DerivedDataset {
  constructor (datasets, options={}) {
    this.referencedDatasets = datasets; // list of one or more dicom-like object instances
    this.dataset = undefined; // a normalized multiframe dicom object instance
    this.derive();
  }
}

class DerivedImage extends DerivedDataset {
  constructor (datasets, options={}) {
    super(datasets, options);
  }

  // this assumes a normalized multiframe input and will create
  // a multiframe derived image
  derive() {
    let referencedDataset = this.referencedDatasets[0];
    // start by making an exact copy of the serializable fields
    this.dataset = JSON.parse(JSON.stringify(referencedDataset));
    // make an array of zeros for the pixels
    this.dataset.PixelData = new ArrayBuffer(referencedDataset.PixelData.byteLength);
    // TODO: mark the data as derived and add references to the source data
    // http://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.7.6.16.2.6
  }
}
