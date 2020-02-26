const expect = require('chai').expect;
const dcmjs = require('../build/dcmjs');

const { DicomMetaDictionary, DicomDict } = dcmjs.data;

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

const metadata = {
  "00020001": {
      "Value": [
        fileMetaInformationVersionArray.buffer
      ],
      "vr": "OB"
  },
  "00020012": {
      "Value": [
          "1.2.840.113819.7.1.1997.1.0"
      ],
      "vr": "UI"
  },
  "00020002": {
      "Value": [
          "1.2.840.10008.5.1.4.1.1.4"
      ],
      "vr": "UI"
  },
  "00020003": {
      "Value": [
          DicomMetaDictionary.uid()
      ],
      "vr": "UI"
  },
  "00020010": {
      "Value": [
          "1.2.840.10008.1.2"
      ],
      "vr": "UI"
  }
};

const tests = {
  test_json_1: () => {

    //
    // multiple results example
    // from http://dicom.nema.org/medical/dicom/current/output/html/part18.html#chapter_F
    //
    const dicomJSON = `
    [
      {
         "0020000D": {
          "vr": "UI",
          "Value": [ "1.2.392.200036.9116.2.2.2.1762893313.1029997326.945873" ]
        }
      },
      {
        "0020000D" : {
          "vr": "UI",
          "Value": [ "1.2.392.200036.9116.2.2.2.2162893313.1029997326.945876" ]
        }
      }
    ]
    `;
    const datasets = JSON.parse(dicomJSON);
    const firstUID = datasets[0]['0020000D'].Value[0];
    const secondUID = datasets[1]['0020000D'].Value[0];

    //
    // make a natural version of the first study and confirm it has correct value
    //
    const naturalDICOM = DicomMetaDictionary.naturalizeDataset(datasets[0]);

    expect(naturalDICOM.StudyInstanceUID).to.equal(firstUID);

    //
    // convert to part10 and back
    //
    const dicomDict = new DicomDict(metadata);
    dicomDict.dict = datasets[1];
    const part10Buffer = dicomDict.write();

    const dicomData = dcmjs.data.DicomMessage.readFile(part10Buffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

    expect(dataset.StudyInstanceUID).to.equal(secondUID);
  },
}

exports.test = () => {
  Object.keys(tests).forEach(testName => {
    console.log("-- Running " + testName);
    tests[testName]();
  });
}

