/**
 * Generates a referenced frame of reference sequence
 * and updates it to includes the reference instance series
 */
export default function getReferencedFrameOfReferenceSequence(
  referencedFrameOfReferenceSequence,
  metadata,
  _options
) {
  const { FrameOfReferenceUID } = metadata;

  referencedFrameOfReferenceSequence ||= [];
  let referencedItem = referencedFrameOfReferenceSequence.find(
    (it) => it.FrameOfReferenceUID === FrameOfReferenceUID
  );
  if (!referencedItem) {
    referencedItem = {
      FrameOfReferenceUID,
    };
    referencedFrameOfReferenceSequence.push(referencedItem);
  }

  // The RTReferencedStudySequence is optional and may be included in a future
  // version of this to specify exactly how this reference occurs.
  return referencedFrameOfReferenceSequence;
}
