const expect = require("chai").expect;
const fs = require('fs');
const path = require("path")
const dcmjs = require('../build/dcmjs.js')
const buffer = fs.readFileSync('sample-dicom.dcm');

const { DicomMessage, DicomMetaDictionary } = dcmjs.data;

console.time('readFile');
const fullData = DicomMessage.readFile(buffer.buffer)
console.timeEnd('readFile');

console.time('readFile without untilTag');
const dicomData = DicomMessage.readFile(buffer.buffer, options={ untilTag: '7FE00010', includeUntilTagValue: false });
console.timeEnd('readFile without untilTag');

console.time('readFile with untilTag');
const dicomData2 = DicomMessage.readFile(buffer.buffer, options={ untilTag: '7FE00010', includeUntilTagValue: true });
console.timeEnd('readFile with untilTag');

const full_dataset = DicomMetaDictionary.naturalizeDataset(fullData.dict);
full_dataset._meta = DicomMetaDictionary.namifyDataset(fullData.meta);

// console.log(full_dataset.PixelData);

const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);

// console.log(dataset.PixelData);

const dataset2 = DicomMetaDictionary.naturalizeDataset(dicomData2.dict);
dataset2._meta = DicomMetaDictionary.namifyDataset(dicomData2.meta);

// console.log(dataset2.PixelData);

expect(full_dataset.PixelData).to.deep.equal(dataset2.PixelData);
expect(dataset.PixelData).to.deep.equal(0);
