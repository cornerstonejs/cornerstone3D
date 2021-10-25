import log from "./log.js";
import { ValueRepresentation } from "./ValueRepresentation";
import dictionary from "./dictionary";
import addAccessors from "./utilities/addAccessors";

class DicomMetaDictionary {
    // intakes a custom dictionary that will be used to parse/denaturalize the dataset
    constructor(customDictionary) {
        this.customDictionary = customDictionary;
        this.customNameMap = DicomMetaDictionary._generateCustomNameMap(
            customDictionary
        );
    }

    static punctuateTag(rawTag) {
        if (rawTag.indexOf(",") !== -1) {
            return rawTag;
        }
        if (rawTag.length === 8 && rawTag === rawTag.match(/[0-9a-fA-F]*/)[0]) {
            var tag = rawTag.toUpperCase();
            return "(" + tag.substring(0, 4) + "," + tag.substring(4, 8) + ")";
        }
    }

    static unpunctuateTag(tag) {
        if (tag.indexOf(",") === -1) {
            return tag;
        }
        return tag.substring(1, 10).replace(",", "");
    }

    // fixes some common errors in VRs
    // TODO: if this gets longer it could go in ValueRepresentation.js
    // or in a dedicated class
    static cleanDataset(dataset) {
        const cleanedDataset = {};
        Object.keys(dataset).forEach(tag => {
            const data = Object.assign({}, dataset[tag]);
            if (data.vr == "SQ") {
                const cleanedValues = [];
                Object.keys(data.Value).forEach(index => {
                    cleanedValues.push(
                        DicomMetaDictionary.cleanDataset(data.Value[index])
                    );
                });
                data.Value = cleanedValues;
            } else {
                // remove null characters from strings
                data.Value = Object.keys(data.Value).map(index => {
                    const item = data.Value[index];
                    if (item.constructor.name == "String") {
                        return item.replace(/\0/, "");
                    }
                    return item;
                });
            }
            cleanedDataset[tag] = data;
        });
        return cleanedDataset;
    }

    // unlike naturalizeDataset, this only
    // changes the names of the member variables
    // but leaves the values intact
    static namifyDataset(dataset) {
        var namedDataset = {};
        Object.keys(dataset).forEach(tag => {
            const data = Object.assign({}, dataset[tag]);
            if (data.vr == "SQ") {
                var namedValues = [];
                Object.keys(data.Value).forEach(index => {
                    namedValues.push(
                        DicomMetaDictionary.namifyDataset(data.Value[index])
                    );
                });
                data.Value = namedValues;
            }
            var punctuatedTag = DicomMetaDictionary.punctuateTag(tag);
            var entry = DicomMetaDictionary.dictionary[punctuatedTag];
            var name = tag;
            if (entry) {
                name = entry.name;
            }
            namedDataset[name] = data;
        });
        return namedDataset;
    }

    /** converts from DICOM JSON Model dataset to a natural dataset
     * - sequences become lists
     * - single element lists are replaced by their first element,
     *     with single element lists remaining lists, but being a
     *     proxy for the child values, see addAccessors for examples
     * - object member names are dictionary, not group/element tag
     */
    static naturalizeDataset(dataset) {
        const naturalDataset = {
            _vrMap: {}
        };

        Object.keys(dataset).forEach(tag => {
            const data = dataset[tag];
            const punctuatedTag = DicomMetaDictionary.punctuateTag(tag);
            const entry = DicomMetaDictionary.dictionary[punctuatedTag];
            let naturalName = tag;

            if (entry) {
                naturalName = entry.name;

                if (entry.vr == "ox") {
                    // when the vr is data-dependent, keep track of the original type
                    naturalDataset._vrMap[naturalName] = data.vr;
                }
            }

            if (data.Value === undefined) {
                // In the case of type 2, add this tag but explictly set it null to indicate its empty.
                naturalDataset[naturalName] = null;

                if (data.InlineBinary) {
                    naturalDataset[naturalName] = {
                        InlineBinary: data.InlineBinary
                    };
                } else if (data.BulkDataURI) {
                    naturalDataset[naturalName] = {
                        BulkDataURI: data.BulkDataURI
                    };
                }
            } else {
                if (data.vr === "SQ") {
                    // convert sequence to list of values
                    const naturalValues = [];

                    Object.keys(data.Value).forEach(index => {
                        naturalValues.push(
                            DicomMetaDictionary.naturalizeDataset(
                                data.Value[index]
                            )
                        );
                    });

                    naturalDataset[naturalName] = naturalValues;
                } else {
                    naturalDataset[naturalName] = data.Value;
                }

                if (naturalDataset[naturalName].length === 1) {
                    const sqZero = naturalDataset[naturalName][0];
                    if (
                        sqZero &&
                        typeof sqZero === "object" &&
                        !sqZero.length
                    ) {
                        addAccessors(naturalDataset[naturalName], sqZero);
                    } else {
                        naturalDataset[naturalName] = sqZero;
                    }
                }
            }
        });
        return naturalDataset;
    }

    static denaturalizeValue(naturalValue) {
        let value = naturalValue;
        if (!Array.isArray(value)) {
            value = [value];
        } else {
            const thereIsUndefinedValues = naturalValue.some(
                item => item === undefined
            );
            if (thereIsUndefinedValues) {
                throw new Error(
                    "There are undefined values at the array naturalValue in DicomMetaDictionary.denaturalizeValue"
                );
            }
        }
        value = value.map(entry =>
            entry.constructor.name == "Number" ? String(entry) : entry
        );
        return value;
    }

    // keep the static function to support previous calls to the class
    static denaturalizeDataset(dataset, nameMap = DicomMetaDictionary.nameMap) {
        var unnaturalDataset = {};
        Object.keys(dataset).forEach(naturalName => {
            // check if it's a sequence
            var name = naturalName;
            var entry = nameMap[name];
            if (entry) {
                let dataValue = dataset[naturalName];

                if (dataValue === undefined) {
                    // handle the case where it was deleted from the object but is in keys
                    return;
                }
                // process this one entry
                var dataItem = {
                    vr: entry.vr,
                    Value: dataset[naturalName]
                };

                if (dataValue !== null) {
                    if (entry.vr == "ox") {
                        if (dataset._vrMap && dataset._vrMap[naturalName]) {
                            dataItem.vr = dataset._vrMap[naturalName];
                        } else {
                            log.error(
                                "No value representation given for",
                                naturalName
                            );
                        }
                    }

                    dataItem.Value = DicomMetaDictionary.denaturalizeValue(
                        dataItem.Value
                    );

                    if (entry.vr == "SQ") {
                        var unnaturalValues = [];
                        for (
                            let datasetIndex = 0;
                            datasetIndex < dataItem.Value.length;
                            datasetIndex++
                        ) {
                            const nestedDataset = dataItem.Value[datasetIndex];
                            unnaturalValues.push(
                                DicomMetaDictionary.denaturalizeDataset(
                                    nestedDataset,
                                    nameMap
                                )
                            );
                        }
                        dataItem.Value = unnaturalValues;
                    }
                    let vr = ValueRepresentation.createByTypeString(
                        dataItem.vr
                    );
                    if (!vr.isBinary() && vr.maxLength) {
                        dataItem.Value = dataItem.Value.map(value => {
                            if (value.length > vr.maxLength) {
                                log.warn(
                                    `Truncating value ${value} of ${naturalName} because it is longer than ${vr.maxLength}`
                                );
                                return value.slice(0, vr.maxLength);
                            } else {
                                return value;
                            }
                        });
                    }
                }

                var tag = DicomMetaDictionary.unpunctuateTag(entry.tag);
                unnaturalDataset[tag] = dataItem;
            } else {
                const validMetaNames = ["_vrMap", "_meta"];
                if (validMetaNames.indexOf(name) == -1) {
                    log.warn(
                        "Unknown name in dataset",
                        name,
                        ":",
                        dataset[name]
                    );
                }
            }
        });
        return unnaturalDataset;
    }

    static uid() {
        let uid = "2.25." + Math.floor(1 + Math.random() * 9);
        for (let index = 0; index < 38; index++) {
            uid = uid + Math.floor(Math.random() * 10);
        }
        return uid;
    }

    // date and time in UTC
    static date() {
        let now = new Date();
        return now
            .toISOString()
            .replace(/-/g, "")
            .slice(0, 8);
    }

    static time() {
        let now = new Date();
        return now
            .toISOString()
            .replace(/:/g, "")
            .slice(11, 17);
    }

    static dateTime() {
        // "2017-07-07T16:09:18.079Z" -> "20170707160918.079"
        let now = new Date();
        return now.toISOString().replace(/[:\-TZ]/g, "");
    }

    static _generateNameMap() {
        DicomMetaDictionary.nameMap = {};
        Object.keys(DicomMetaDictionary.dictionary).forEach(tag => {
            var dict = DicomMetaDictionary.dictionary[tag];
            if (dict.version != "PrivateTag") {
                DicomMetaDictionary.nameMap[dict.name] = dict;
            }
        });
    }

    static _generateCustomNameMap(dictionary) {
        const nameMap = {};
        Object.keys(dictionary).forEach(tag => {
            var dict = dictionary[tag];
            if (dict.version != "PrivateTag") {
                nameMap[dict.name] = dict;
            }
        });
        return nameMap;
    }

    static _generateUIDMap() {
        DicomMetaDictionary.sopClassUIDsByName = {};
        Object.keys(DicomMetaDictionary.sopClassNamesByUID).forEach(uid => {
            var name = DicomMetaDictionary.sopClassNamesByUID[uid];
            DicomMetaDictionary.sopClassUIDsByName[name] = uid;
        });
    }

    // denaturalizes dataset using custom dictionary and nameMap
    denaturalizeDataset(dataset) {
        return DicomMetaDictionary.denaturalizeDataset(
            dataset,
            this.customNameMap
        );
    }
}

// Subset of those listed at:
// http://dicom.nema.org/medical/dicom/current/output/html/part04.html#sect_B.5
DicomMetaDictionary.sopClassNamesByUID = {
    "1.2.840.10008.5.1.4.1.1.2": "CTImage",
    "1.2.840.10008.5.1.4.1.1.2.1": "EnhancedCTImage",
    "1.2.840.10008.5.1.4.1.1.2.2": "LegacyConvertedEnhancedCTImage",
    "1.2.840.10008.5.1.4.1.1.3.1": "USMultiframeImage",
    "1.2.840.10008.5.1.4.1.1.4": "MRImage",
    "1.2.840.10008.5.1.4.1.1.4.1": "EnhancedMRImage",
    "1.2.840.10008.5.1.4.1.1.4.2": "MRSpectroscopy",
    "1.2.840.10008.5.1.4.1.1.4.3": "EnhancedMRColorImage",
    "1.2.840.10008.5.1.4.1.1.4.4": "LegacyConvertedEnhancedMRImage",
    "1.2.840.10008.5.1.4.1.1.6.1": "USImage",
    "1.2.840.10008.5.1.4.1.1.6.2": "EnhancedUSVolume",
    "1.2.840.10008.5.1.4.1.1.7": "SecondaryCaptureImage",
    "1.2.840.10008.5.1.4.1.1.30": "ParametricMapStorage",
    "1.2.840.10008.5.1.4.1.1.66": "RawData",
    "1.2.840.10008.5.1.4.1.1.66.1": "SpatialRegistration",
    "1.2.840.10008.5.1.4.1.1.66.2": "SpatialFiducials",
    "1.2.840.10008.5.1.4.1.1.66.3": "DeformableSpatialRegistration",
    "1.2.840.10008.5.1.4.1.1.66.4": "Segmentation",
    "1.2.840.10008.5.1.4.1.1.67": "RealWorldValueMapping",
    "1.2.840.10008.5.1.4.1.1.88.11": "BasicTextSR",
    "1.2.840.10008.5.1.4.1.1.88.22": "EnhancedSR",
    "1.2.840.10008.5.1.4.1.1.88.33": "ComprehensiveSR",
    "1.2.840.10008.5.1.4.1.1.128": "PETImage",
    "1.2.840.10008.5.1.4.1.1.130": "EnhancedPETImage",
    "1.2.840.10008.5.1.4.1.1.128.1": "LegacyConvertedEnhancedPETImage"
};

DicomMetaDictionary.dictionary = dictionary;

DicomMetaDictionary._generateNameMap();
DicomMetaDictionary._generateUIDMap();

export { DicomMetaDictionary };
