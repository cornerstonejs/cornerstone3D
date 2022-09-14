import dcmjs from "../src/index.js";
import fs from "fs";

const { DicomMessage } = dcmjs.data;
const { cleanTags, getTagsNameToEmpty } = dcmjs.anonymizer;

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
});

it("test_anonymization_tagtoreplace_param", () => {
    // given
    const arrayBuffer = fs.readFileSync("test/sample-dicom.dcm").buffer;
    const dicomDict = DicomMessage.readFile(arrayBuffer);

    const tagInfo = dcmjs.data.DicomMetaDictionary.nameMap["PatientName"];
    const tagNumber = tagInfo.tag,
        tagString = dcmjs.data.Tag.fromPString(tagNumber).toCleanString();

    const patientNameTag = dicomDict.dict[tagString];
    const patientNameValue = patientNameTag.Value;

    expect(patientNameValue).toEqual(["Fall 3"]);

    var tagsToReplace = {
        "00100010":   "REPLACE^PATIENT"
    }
    // when
    cleanTags(dicomDict.dict, tagsToReplace);

    // then
    expect(patientNameTag.Value).toEqual(["REPLACE^PATIENT"]);
});

it("test_anonymization_keep_tag", () => {
    // given
    const arrayBuffer = fs.readFileSync("test/sample-dicom.dcm").buffer;
    const dicomDict = DicomMessage.readFile(arrayBuffer);

    const tagInfo = dcmjs.data.DicomMetaDictionary.nameMap["SeriesDescription"];
    const tagNumber = tagInfo.tag,
        tagString = dcmjs.data.Tag.fromPString(tagNumber).toCleanString();

    const seriesDescriptionTag = dicomDict.dict[tagString];
    const seriesDescriptionValue = seriesDescriptionTag.Value;

    expect(seriesDescriptionValue).toEqual(["Oberbauch  *sSSH/FB/4mm"]);

    var tagsToReplace = {};
    var tagsToKeep = getTagsNameToEmpty();
    var seriesDescription = "SeriesDescription";
    if (tagsToKeep.indexOf(seriesDescription) != -1) {
        tagsToKeep.splice(tagsToKeep.indexOf(seriesDescription), 1);
    } 

    // when
    cleanTags(dicomDict.dict, tagsToReplace, tagsToKeep);

    // then
    expect(seriesDescriptionTag.Value).toEqual(["Oberbauch  *sSSH/FB/4mm"]);
});

it("test_anonymization_anonymize_tag", () => {
    // given
    const arrayBuffer = fs.readFileSync("test/sample-dicom.dcm").buffer;
    const dicomDict = DicomMessage.readFile(arrayBuffer);

    const tagInfo = dcmjs.data.DicomMetaDictionary.nameMap["SeriesInstanceUID"];
    const tagNumber = tagInfo.tag,
        tagString = dcmjs.data.Tag.fromPString(tagNumber).toCleanString();

    const SeriesInstanceUIDTag = dicomDict.dict[tagString];
    const SeriesInstanceUIDValue = SeriesInstanceUIDTag.Value;

    expect(SeriesInstanceUIDValue).toEqual(["1.2.276.0.50.192168001092.11156604.14547392.303"]);

    var tagsToReplace = {};
    var tagsToAnon = getTagsNameToEmpty();
    if (!tagsToAnon.includes("SeriesInstanceUID")) {
        tagsToAnon.push("SeriesInstanceUID");
    } 

    // when
    cleanTags(dicomDict.dict, tagsToReplace, tagsToAnon);

    // then
    expect(SeriesInstanceUIDTag.Value).toEqual([]);
});