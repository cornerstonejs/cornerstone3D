export const seriesTags = [
    "SeriesInstanceUID",
    "SeriesNumber",
    "SeriesDescription",
    "Modality",
    "SeriesDate",
    "SeriesTime"
];

/**
 * Copies series tags from src into a new object.
 *
 * Usage:  `const newStudyInstance = copySeriesTags(exampleInstance)`
 */
export function copySeriesTags(src) {
    const study = {
        _meta: src._meta,
        _vrMap: src._vrMap
    };
    for (const tagKey of seriesTags) {
        const value = src[tagKey];
        if (value === undefined) {
            continue;
        }
        study[tagKey] = value;
    }
    return study;
}
