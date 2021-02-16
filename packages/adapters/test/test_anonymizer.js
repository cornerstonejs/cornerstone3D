const expect = require("chai").expect;
const fs = require("fs");
const path = require("path");

const dcmjs = require("../build/dcmjs");
const { DicomMetaDictionary, DicomDict, DicomMessage } = dcmjs.data;
const { cleanTags } = dcmjs.anonymizer;

const tests = {
  test_export: () => {
    expect(typeof cleanTags).to.equal("function");
  },
  test_anonymization: () => {
    // given
    const arrayBuffer = fs.readFileSync(path.resolve(__dirname, "sample-dicom.dcm")).buffer;
    const dicomDict = DicomMessage.readFile(arrayBuffer);
    expect(1).to.equal(1);

    const tagInfo = dcmjs.data.DicomMetaDictionary.nameMap["PatientName"];
    const tagNumber = tagInfo.tag,
      tagString = dcmjs.data.Tag.fromPString(tagNumber).toCleanString();

    const patientIDTag = dicomDict.dict[tagString];
    const patientIDValue = patientIDTag.Value;

    expect(patientIDValue).to.deep.equal(["Fall 3"]);

    // when
    cleanTags(dicomDict.dict);

    // then
    expect(patientIDTag.Value).to.deep.equal(["ANON^PATIENT"]);
  },
};

exports.test = (testToRun) => {
  Object.keys(tests).forEach((testName) => {
    if (testToRun && !testName.toLowerCase().includes(testToRun.toLowerCase())) {
      console.log("-- Skipping " + testName);
      return false;
    }
    console.log("-- Starting " + testName);
    tests[testName]();
  });
};
