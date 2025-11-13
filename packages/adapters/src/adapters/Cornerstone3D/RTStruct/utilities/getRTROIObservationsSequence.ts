export default function getRTROIObservationsSequence(segment, index, options?) {
  return {
    ObservationNumber: index + 1,
    ReferencedROINumber: segment.segmentIndex ?? index + 1,
    RTROIInterpretedType: options?.interpretedType || 'ORGAN',
    ROIInterpreter: options?.observerName || '',
  };
}
