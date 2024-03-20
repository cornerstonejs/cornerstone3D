export default function getReferencedFrameOfReferenceSequence(
    metadata,
    metadataProvider,
    dataset
) {
    const { referencedImageId: imageId, FrameOfReferenceUID } = metadata;
    const instance = metadataProvider.get("instanceModule", imageId);
    const { SeriesInstanceUID } = instance;

    const { ReferencedSeriesSequence } = dataset;

    return [
        {
            FrameOfReferenceUID,
            RTReferencedStudySequence: [
                {
                    ReferencedSOPClassUID: dataset.SOPClassUID,
                    ReferencedSOPInstanceUID: dataset.SOPInstanceUID,
                    RTReferencedSeriesSequence: [
                        {
                            SeriesInstanceUID,
                            ContourImageSequence: [
                                ...ReferencedSeriesSequence[0]
                                    .ReferencedInstanceSequence
                            ]
                        }
                    ]
                }
            ]
        }
    ];
}
