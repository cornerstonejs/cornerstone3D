import { normalizers, data, utilities, derivations } from "dcmjs";

import { toArray, codeMeaningEquals } from "../helpers";
import Cornerstone3DCodingScheme from "./CodingScheme";

const { TID1500, addAccessors } = utilities;

const { StructuredReport } = derivations;

const { Normalizer } = normalizers;

const { TID1500MeasurementReport, TID1501MeasurementGroup } = TID1500;

const { DicomMetaDictionary } = data;

const FINDING = { CodingSchemeDesignator: "DCM", CodeValue: "121071" };
const FINDING_SITE = { CodingSchemeDesignator: "SCT", CodeValue: "363698007" };
const FINDING_SITE_OLD = { CodingSchemeDesignator: "SRT", CodeValue: "G-C0E3" };

const codeValueMatch = (group, code, oldCode?) => {
    const { ConceptNameCodeSequence } = group;
    if (!ConceptNameCodeSequence) return;
    const { CodingSchemeDesignator, CodeValue } = ConceptNameCodeSequence;
    return (
        (CodingSchemeDesignator == code.CodingSchemeDesignator &&
            CodeValue == code.CodeValue) ||
        (oldCode &&
            CodingSchemeDesignator == oldCode.CodingSchemeDesignator &&
            CodeValue == oldCode.CodeValue)
    );
};

function getTID300ContentItem(
    tool,
    toolType,
    ReferencedSOPSequence,
    toolClass,
    worldToImageCoords
) {
    const args = toolClass.getTID300RepresentationArguments(
        tool,
        worldToImageCoords
    );
    args.ReferencedSOPSequence = ReferencedSOPSequence;

    const TID300Measurement = new toolClass.TID300Representation(args);

    return TID300Measurement;
}

function getMeasurementGroup(
    toolType,
    toolData,
    ReferencedSOPSequence,
    worldToImageCoords
) {
    const toolTypeData = toolData[toolType];
    const toolClass =
        MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_TOOL_TYPE[toolType];
    if (
        !toolTypeData ||
        !toolTypeData.data ||
        !toolTypeData.data.length ||
        !toolClass
    ) {
        return;
    }

    // Loop through the array of tool instances
    // for this tool
    const Measurements = toolTypeData.data.map(tool => {
        return getTID300ContentItem(
            tool,
            toolType,
            ReferencedSOPSequence,
            toolClass,
            worldToImageCoords
        );
    });

    return new TID1501MeasurementGroup(Measurements);
}

export default class MeasurementReport {
    public static MEASUREMENT_BY_TOOLTYPE = {};
    public static CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE = {};
    public static CORNERSTONE_TOOL_CLASSES_BY_TOOL_TYPE = {};

    static getCornerstoneLabelFromDefaultState(defaultState) {
        const { findingSites = [], finding } = defaultState;

        const cornersoneFreeTextCodingValue =
            Cornerstone3DCodingScheme.codeValues.CORNERSTONEFREETEXT;

        const freeTextLabel = findingSites.find(
            fs => fs.CodeValue === cornersoneFreeTextCodingValue
        );

        if (freeTextLabel) {
            return freeTextLabel.CodeMeaning;
        }

        if (finding && finding.CodeValue === cornersoneFreeTextCodingValue) {
            return finding.CodeMeaning;
        }
    }

    static generateDatasetMeta() {
        // TODO: what is the correct metaheader
        // http://dicom.nema.org/medical/Dicom/current/output/chtml/part10/chapter_7.html
        // TODO: move meta creation to happen in derivations.js
        const fileMetaInformationVersionArray = new Uint8Array(2);
        fileMetaInformationVersionArray[1] = 1;

        const _meta = {
            FileMetaInformationVersion: {
                Value: [fileMetaInformationVersionArray.buffer],
                vr: "OB"
            },
            //MediaStorageSOPClassUID
            //MediaStorageSOPInstanceUID: sopCommonModule.sopInstanceUID,
            TransferSyntaxUID: {
                Value: ["1.2.840.10008.1.2.1"],
                vr: "UI"
            },
            ImplementationClassUID: {
                Value: [DicomMetaDictionary.uid()], // TODO: could be git hash or other valid id
                vr: "UI"
            },
            ImplementationVersionName: {
                Value: ["dcmjs"],
                vr: "SH"
            }
        };

        return _meta;
    }

    static generateDerivationSourceDataset = instance => {
        const _vrMap = {
            PixelData: "OW"
        };

        const _meta = MeasurementReport.generateDatasetMeta();

        const derivationSourceDataset = {
            ...instance,
            _meta: _meta,
            _vrMap: _vrMap
        };

        return derivationSourceDataset;
    };

    static getSetupMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        metadata,
        toolType
    ) {
        const { ContentSequence } = MeasurementGroup;

        const contentSequenceArr = toArray(ContentSequence);
        const findingGroup = contentSequenceArr.find(group =>
            codeValueMatch(group, FINDING)
        );
        const findingSiteGroups =
            contentSequenceArr.filter(group =>
                codeValueMatch(group, FINDING_SITE, FINDING_SITE_OLD)
            ) || [];
        const NUMGroup = contentSequenceArr.find(
            group => group.ValueType === "NUM"
        );
        const SCOORDGroup = toArray(NUMGroup.ContentSequence).find(
            group => group.ValueType === "SCOORD"
        );
        const { ReferencedSOPSequence } = SCOORDGroup.ContentSequence;
        const { ReferencedSOPInstanceUID, ReferencedFrameNumber } =
            ReferencedSOPSequence;

        const referencedImageId =
            sopInstanceUIDToImageIdMap[ReferencedSOPInstanceUID];
        const imagePlaneModule = metadata.get(
            "imagePlaneModule",
            referencedImageId
        );

        const finding = findingGroup
            ? addAccessors(findingGroup.ConceptCodeSequence)
            : undefined;
        const findingSites = findingSiteGroups.map(fsg => {
            return addAccessors(fsg.ConceptCodeSequence);
        });

        const defaultState = {
            description: undefined,
            sopInstanceUid: ReferencedSOPInstanceUID,
            annotation: {
                annotationUID: DicomMetaDictionary.uid(),
                metadata: {
                    toolName: toolType,
                    referencedImageId,
                    FrameOfReferenceUID: imagePlaneModule.frameOfReferenceUID,
                    label: ""
                }
            },
            finding,
            findingSites
        };
        if (defaultState.finding) {
            defaultState.description = defaultState.finding.CodeMeaning;
        }

        defaultState.annotation.metadata.label =
            MeasurementReport.getCornerstoneLabelFromDefaultState(defaultState);

        return {
            defaultState,
            NUMGroup,
            SCOORDGroup,
            ReferencedSOPSequence,
            ReferencedSOPInstanceUID,
            ReferencedFrameNumber
        };
    }

    static generateReport(
        toolState,
        metadataProvider,
        worldToImageCoords,
        options
    ) {
        // ToolState for array of imageIDs to a Report
        // Assume Cornerstone metadata provider has access to Study / Series / Sop Instance UID
        let allMeasurementGroups = [];

        /* Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Date
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Time
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study ID
        */

        const sopInstanceUIDsToSeriesInstanceUIDMap = {};
        const derivationSourceDatasets = [];

        const _meta = MeasurementReport.generateDatasetMeta();

        // Loop through each image in the toolData
        Object.keys(toolState).forEach(imageId => {
            const sopCommonModule = metadataProvider.get(
                "sopCommonModule",
                imageId
            );
            const instance = metadataProvider.getInstance(imageId);

            const { sopInstanceUID, sopClassUID } = sopCommonModule;
            const { SeriesInstanceUID: seriesInstanceUID } = instance;

            sopInstanceUIDsToSeriesInstanceUIDMap[sopInstanceUID] =
                seriesInstanceUID;

            if (
                !derivationSourceDatasets.find(
                    dsd => dsd.SeriesInstanceUID === seriesInstanceUID
                )
            ) {
                // Entry not present for series, create one.
                const derivationSourceDataset =
                    MeasurementReport.generateDerivationSourceDataset(instance);

                derivationSourceDatasets.push(derivationSourceDataset);
            }

            const frameNumber = metadataProvider.get("frameNumber", imageId);
            const toolData = toolState[imageId];
            const toolTypes = Object.keys(toolData);

            const ReferencedSOPSequence = {
                ReferencedSOPClassUID: sopClassUID,
                ReferencedSOPInstanceUID: sopInstanceUID,
                ReferencedFrameNumber: undefined
            };

            if (
                (instance &&
                    instance.NumberOfFrames &&
                    instance.NumberOfFrames > 1) ||
                Normalizer.isMultiframeSOPClassUID(sopClassUID)
            ) {
                ReferencedSOPSequence.ReferencedFrameNumber = frameNumber;
            }

            // Loop through each tool type for the image
            const measurementGroups = [];

            toolTypes.forEach(toolType => {
                const group = getMeasurementGroup(
                    toolType,
                    toolData,
                    ReferencedSOPSequence,
                    worldToImageCoords
                );
                if (group) {
                    measurementGroups.push(group);
                }
            });

            allMeasurementGroups =
                allMeasurementGroups.concat(measurementGroups);
        });

        const tid1500MeasurementReport = new TID1500MeasurementReport(
            { TID1501MeasurementGroups: allMeasurementGroups },
            options
        );

        const report = new StructuredReport(derivationSourceDatasets, options);

        const contentItem = tid1500MeasurementReport.contentItem(
            derivationSourceDatasets,
            { ...options, sopInstanceUIDsToSeriesInstanceUIDMap }
        );

        // Merge the derived dataset with the content from the Measurement Report
        report.dataset = Object.assign(report.dataset, contentItem);
        report.dataset._meta = _meta;

        return report;
    }

    /**
     * Generate Cornerstone tool state from dataset
     */
    static generateToolState(
        dataset,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata,
        hooks
    ) {
        // For now, bail out if the dataset is not a TID1500 SR with length measurements
        if (dataset.ContentTemplateSequence.TemplateIdentifier !== "1500") {
            throw new Error(
                "This package can currently only interpret DICOM SR TID 1500"
            );
        }

        const REPORT = "Imaging Measurements";
        const GROUP = "Measurement Group";
        const TRACKING_IDENTIFIER = "Tracking Identifier";

        // Identify the Imaging Measurements
        const imagingMeasurementContent = toArray(dataset.ContentSequence).find(
            codeMeaningEquals(REPORT)
        );

        // Retrieve the Measurements themselves
        const measurementGroups = toArray(
            imagingMeasurementContent.ContentSequence
        ).filter(codeMeaningEquals(GROUP));

        // For each of the supported measurement types, compute the measurement data
        const measurementData = {};

        const cornerstoneToolClasses =
            MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE;

        const registeredToolClasses = [];

        Object.keys(cornerstoneToolClasses).forEach(key => {
            registeredToolClasses.push(cornerstoneToolClasses[key]);
            measurementData[key] = [];
        });

        measurementGroups.forEach(measurementGroup => {
            const measurementGroupContentSequence = toArray(
                measurementGroup.ContentSequence
            );

            const TrackingIdentifierGroup =
                measurementGroupContentSequence.find(
                    contentItem =>
                        contentItem.ConceptNameCodeSequence.CodeMeaning ===
                        TRACKING_IDENTIFIER
                );

            const TrackingIdentifierValue = TrackingIdentifierGroup.TextValue;

            const toolClass =
                hooks?.getToolClass?.(
                    measurementGroup,
                    dataset,
                    registeredToolClasses
                ) ||
                registeredToolClasses.find(tc =>
                    tc.isValidCornerstoneTrackingIdentifier(
                        TrackingIdentifierValue
                    )
                );

            if (toolClass) {
                const measurement = toolClass.getMeasurementData(
                    measurementGroup,
                    sopInstanceUIDToImageIdMap,
                    imageToWorldCoords,
                    metadata
                );

                console.log(`=== ${toolClass.toolType} ===`);
                console.log(measurement);

                measurementData[toolClass.toolType].push(measurement);
            }
        });

        // NOTE: There is no way of knowing the cornerstone imageIds as that could be anything.
        // That is up to the consumer to derive from the SOPInstanceUIDs.
        return measurementData;
    }

    static registerTool(toolClass) {
        MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE[
            toolClass.utilityToolType
        ] = toolClass;
        MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_TOOL_TYPE[
            toolClass.toolType
        ] = toolClass;
        MeasurementReport.MEASUREMENT_BY_TOOLTYPE[toolClass.toolType] =
            toolClass.utilityToolType;
    }
}
