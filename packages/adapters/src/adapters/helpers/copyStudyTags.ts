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
    "StudyID",
    "ReferringPhysicianName",
    "BodyPartExamined",
    "TimezoneOffsetFromUTC"
];

/**
 * A list of patient/study tag names used to create new instances in the same study
 * from an existing instance.
 */
export const patientStudyTags = [...patientTags, ...studyTags];

/**
 * Copies study (and patient) tags from src into a new object.
 * This prevents copying series and instance tags from the src when
 * creating a new object in the same study, but for a different/new series.
 *
 * Usage:  `const newStudyInstance = copyStudyTags(exampleInstance)`
 * Then fill out the `newStudyInstance` with series and instance level data
 * appropriate for whatever you are creating.
 */
export function copyStudyTags(src) {
    const study = {
        _meta: src._meta,
        _vrMap: src._vrMap
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
