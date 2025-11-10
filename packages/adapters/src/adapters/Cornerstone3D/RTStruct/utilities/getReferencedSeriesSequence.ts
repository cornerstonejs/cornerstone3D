import { metaData, Enums } from '@cornerstonejs/core';

const { MetadataModules } = Enums;

export default function getReferencedSeriesSequence(
  referencedSeriesSequence,
  metadata,
  options?
) {
  const metadataProvider = options?.metadataProvider || metaData;

  // grab imageId from toolData
  const { referencedImageId: imageId } = metadata;
  const newReferenceSeq = metadataProvider.get(
    MetadataModules.REFERENCED_SERIES_REFERENCE,
    imageId
  );

  referencedSeriesSequence ||= [];
  if (newReferenceSeq) {
    const {
      ReferencedSeriesInstanceUID: newSeriesUid,
      ReferencedInstanceSequence: [{ ReferencedSOPInstanceUID: newSopUID }],
    } = newReferenceSeq;

    const existingSeries = referencedSeriesSequence.find(
      (it) => it.ReferencedSeriesInstanceUID === newSeriesUid
    );
    if (!existingSeries) {
      referencedSeriesSequence.push(newReferenceSeq);
      return referencedSeriesSequence;
    }

    if (
      existingSeries.ReferencedInstanceSequence.find(
        (it) => it.ReferencedSOPInstanceUID === newSopUID
      )
    ) {
      // Both the series and the SOP already exist, just return
      return referencedSeriesSequence;
    }

    existingSeries.ReferencedInstanceSequence.push(
      newReferenceSeq.ReferencedInstanceSequence
    );
  }

  return referencedSeriesSequence;
}
