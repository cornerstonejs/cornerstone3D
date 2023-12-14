export default function getRTROIObservationsSequence(toolData, index) {
  return {
    ObservationNumber: index + 1,
    ReferencedROINumber: index + 1,
    RTROIInterpretedType: 'Todo: type',
    ROIInterpreter: 'Todo: interpreter',
  };
}
