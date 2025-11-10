export default function getReferencedFrameOfReferenceSequence(
  referencedFrameOfReferenceSequence,
  metadata,
  _options
) {
  const { FrameOfReferenceUID } = metadata;

  referencedFrameOfReferenceSequence ||= [];
  if (referencedFrameOfReferenceSequence.indexOf(FrameOfReferenceUID) === -1) {
    referencedFrameOfReferenceSequence.push(FrameOfReferenceUID);
  }
  // TODO - update this with references for every instance or frame? referenced

  // The RTReferencedStudySequence is optional and may be included in a future
  // version of this to specify exactly how this reference occurs.
  return referencedFrameOfReferenceSequence;
}
