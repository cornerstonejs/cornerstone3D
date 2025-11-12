export default function getRTROIObservationsSequence(segment, index, options?) {
  return {
    ObservationNumber: segment.segmentIndex ?? index + 1,
    ReferencedROINumber: index + 1,
    RTROIInterpretedType: options?.interpretedType || 'ORGAN',
    ROIInterpreter: options?.observerName || '',
  };
}
