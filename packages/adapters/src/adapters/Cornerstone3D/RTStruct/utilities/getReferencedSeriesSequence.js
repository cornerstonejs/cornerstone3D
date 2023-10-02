export default function getReferencedSeriesSequence(
    contour,
    _index,
    metadataProvider,
    DicomMetadataStore
) {
    // grab imageId from toolData
    const { referencedImageId: imageId } = contour.metadata;
    const instance = metadataProvider.get("instance", imageId);
    const { SeriesInstanceUID, StudyInstanceUID } = instance;

    const ReferencedSeriesSequence = [];
    if (SeriesInstanceUID) {
        const series = DicomMetadataStore.getSeries(
            StudyInstanceUID,
            SeriesInstanceUID
        );

        const ReferencedSeries = {
            SeriesInstanceUID,
            ReferencedInstanceSequence: []
        };

        series.instances.forEach(instance => {
            const { SOPInstanceUID, SOPClassUID } = instance;
            ReferencedSeries.ReferencedInstanceSequence.push({
                ReferencedSOPClassUID: SOPClassUID,
                ReferencedSOPInstanceUID: SOPInstanceUID
            });
        });

        ReferencedSeriesSequence.push(ReferencedSeries);
    }

    return ReferencedSeriesSequence;
}
