import dcmjs from "dcmjs";

export const patientTags = [
    "PatientName",
    "PatientID",
    "PatientBirthDate",
    "PatientBirthTime",
    "PatientID",
    "IssuerOfPatientID",
    "OtherPatientIDs",
    "OtherPatientIDsSequence",
    "PatientSex",
    "PatientIdentityRemoved",
    "DeidentificationMethodCodeSequence"
];

export const studyTags = [
    "StudyDate",
    "StudyTime",
    "StudyStatusID",
    "StudyPriorityID",
    "StudyInstanceUID",
    "StudyDescription",
    "AccessionNumber",
    "StudyID"
];

export const patientStudyTags = [...patientTags, ...studyTags];

export function copyStudyTags(src, meta, vrMap) {
    const study = {
        _meta: meta,
        _vrMap: vrMap
    };
    for (const tagKey of patientStudyTags) {
        const value = src[tagKey];
        if (value === undefined) {
            continue;
        }
        study[tagKey] = value;
    }
    return study;
}
