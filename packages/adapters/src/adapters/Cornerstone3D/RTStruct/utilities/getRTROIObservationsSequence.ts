export default function getRTROIObservationsSequence(
  toolData,
  index,
  options?
) {
  return {
    ObservationNumber: index + 1,
    ReferencedROINumber: index + 1,
    RTROIInterpretedType: options?.interpretedType || 'ORGAN',
    ROIInterpreter: options?.observerName || '',
  };
}
