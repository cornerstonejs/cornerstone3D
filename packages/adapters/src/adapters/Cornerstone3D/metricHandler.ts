export interface AdditionalMetrics {
    mean?: number;
    stdDev?: number;
    max?: number;
    min?: number;
    area?: number;
    radius?: number;
    modalityUnit?: string;
    areaUnit?: string;
    [key: string]: number | string | undefined;
}

/**
 * Extracts all NUM (numeric measurement) groups from a TID1500 Measurement Group’s
 * `ContentSequence`, organizing them by their referenced SOP Instance UID.
 *
 * Each NUM group represents a quantitative measurement (e.g., Mean, Area, Length)
 * recorded in the DICOM SR. This function collects all such entries, extracting
 * their numeric values, units, and associated DICOM concept meanings.
 *
 * The result is a dictionary keyed by `ReferencedSOPInstanceUID`, where each value
 * contains a set of measurements for that instance (e.g., `{ Mean: { value, unit }, Area: { value, unit } }`).
 *
 * @param {Object} MeasurementGroup - The TID1500 Measurement Group content item to parse.
 *
 * @returns {Object} A dictionary of extracted NUM groups organized by SOP Instance UID.
 */

export function extractAllNUMGroups(
    MeasurementGroup,
    referencedSOPInstanceUID
) {
    const numGroupsBySOPInstanceUID = {};

    if (MeasurementGroup.ContentSequence) {
        MeasurementGroup.ContentSequence.forEach(item => {
            if (item.ValueType === "NUM" && item.ConceptNameCodeSequence) {
                const codeMeaning = item.ConceptNameCodeSequence.CodeMeaning;
                const numericValue = item.MeasuredValueSequence?.NumericValue;
                const unitCode =
                    item.MeasuredValueSequence?.MeasurementUnitsCodeSequence
                        ?.CodeValue;

                if (numericValue !== undefined && referencedSOPInstanceUID) {
                    if (!numGroupsBySOPInstanceUID[referencedSOPInstanceUID]) {
                        numGroupsBySOPInstanceUID[referencedSOPInstanceUID] =
                            {};
                    }

                    numGroupsBySOPInstanceUID[referencedSOPInstanceUID][
                        codeMeaning
                    ] = {
                        value: numericValue,
                        unit: unitCode || ""
                    };
                }
            }
        });
    }

    return numGroupsBySOPInstanceUID;
}

/**
 * Restores additional measurement metrics from previously extracted NUM groups.
 *
 * Maps DICOM Concept Name Code Meanings (e.g., "Mean", "Area") to internal
 * `cachedStats` property names, reconstructing a flat metrics object
 * (e.g., `{ mean, stdDev, area, length, ... }`) with proper units.
 *
 * Also detects and assigns the appropriate unit category for each metric
 * (e.g., modalityUnit, areaUnit, radiusUnit) and formats area units with
 * superscripts where applicable.
 *
 * @param {Object} numGroups - An object of NUM groups extracted via {@link extractAllNUMGroups}.
 * @returns {AdditionalMetrics} An object containing reconstructed measurement metrics and their associated units.
 *
 */

export function restoreAdditionalMetrics(numGroups): AdditionalMetrics {
    const additionalMetrics: AdditionalMetrics = {};
    let modalityUnit: string = "";

    const metricMapping = {
        Mean: "mean",
        "Standard Deviation": "stdDev",
        Maximum: "max",
        Minimum: "min",
        Area: "area",
        Radius: "radius",
        Perimeter: "perimeter",
        Length: "length",
        Width: "width"
    };

    // Define what kind of unit each metric type should use
    const unitCategory = {
        area: "areaUnit",
        radius: "radiusUnit",
        width: "widthUnit"
    };

    for (const [codeMeaning, metricKey] of Object.entries(metricMapping)) {
        const group = numGroups[codeMeaning];
        if (!group) {
            continue;
        }

        const { value, unit } = group;
        if (value == null) {
            continue;
        }

        additionalMetrics[metricKey] = value;

        if (!unit) {
            continue;
        }
        if (!modalityUnit) {
            modalityUnit = unit;
        }

        const category = unitCategory[metricKey];
        if (category) {
            if (!additionalMetrics[category]) {
                additionalMetrics[category] = unit;
            }
        } else {
            additionalMetrics[`${metricKey}Unit`] = unit;
        }
    }

    additionalMetrics.modalityUnit = modalityUnit;

    return additionalMetrics;
}
