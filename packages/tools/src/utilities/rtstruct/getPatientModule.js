export default function getPatientModule(imageId, metadataProvider) {
  const generalSeriesModule = metadataProvider.get(
    'generalSeriesModule',
    imageId
  );
  const generalStudyModule = metadataProvider.get(
    'generalStudyModule',
    imageId
  );
  const patientStudyModule = metadataProvider.get(
    'patientStudyModule',
    imageId
  );
  const patientModule = metadataProvider.get('patientModule', imageId);
  const patientDemographicModule = metadataProvider.get(
    'patientDemographicModule',
    imageId
  );

  return {
    Modality: generalSeriesModule.modality,
    PatientID: patientModule.patientId,
    PatientName: patientModule.patientName,
    PatientBirthDate: '',
    PatientAge: patientStudyModule.patientAge,
    PatientSex: patientDemographicModule.patientSex,
    PatientWeight: patientStudyModule.patientWeight,
    StudyDate: generalStudyModule.studyDate,
    StudyTime: generalStudyModule.studyTime,
    StudyID: 'ToDo',
    AccessionNumber: generalStudyModule.accessionNumber,
  };
}
