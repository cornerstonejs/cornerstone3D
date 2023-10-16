export default function getRTSeriesModule(DicomMetaDictionary) {
    return {
        SeriesInstanceUID: DicomMetaDictionary.uid(), // generate a new series instance uid
        SeriesNumber: "99" // Todo:: what should be the series number?
    };
}
