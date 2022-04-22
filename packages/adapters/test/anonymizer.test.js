import dcmjs from '../src/index.js';
import fs from "fs";

const { DicomMessage } = dcmjs.data;
const { cleanTags } = dcmjs.anonymizer;

it("test_export", () => {
    expect(typeof cleanTags).toEqual("function");
});

it("test_anonymization", () => {
    // given
    const arrayBuffer = fs.readFileSync("test/sample-dicom.dcm").buffer;
    const dicomDict = DicomMessage.readFile(arrayBuffer);

    const tagInfo = dcmjs.data.DicomMetaDictionary.nameMap["PatientName"];
    const tagNumber = tagInfo.tag,
        tagString = dcmjs.data.Tag.fromPString(tagNumber).toCleanString();

    const patientIDTag = dicomDict.dict[tagString];
    const patientIDValue = patientIDTag.Value;

    expect(patientIDValue).toEqual(["Fall 3"]);

    // when
    cleanTags(dicomDict.dict);

    // then
    expect(patientIDTag.Value).toEqual(["ANON^PATIENT"]);
})
