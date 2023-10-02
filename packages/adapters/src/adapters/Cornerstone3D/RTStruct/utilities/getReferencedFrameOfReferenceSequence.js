export default function getReferencedFrameOfReferenceSequence(
    contour,
    metadataProvider,
    dataset
) {
    const { referencedImageId: imageId, FrameOfReferenceUID } =
        contour.metadata;
    const instance = metadataProvider.get("instance", imageId);
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
