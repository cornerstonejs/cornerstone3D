export const seriesTags = [
    "SeriesInstanceUID",
    "SeriesNumber",
    "SeriesDescription",
    "Modality",
    "SeriesDate",
    "SeriesTime",
    "_meta",
    "_vrMap"
];

/**
 * Copies series tags from src into a new object.
 *
 * Usage:  `const newStudyInstance = copySeriesTags(exampleInstance)`
 */
export function copySeriesTags(src) {
    const study = {};
    for (const tagKey of seriesTags) {
        const value = src[tagKey];
        if (value === undefined) {
            continue;
        }
        study[tagKey] = value;
    }
    return study;
}
