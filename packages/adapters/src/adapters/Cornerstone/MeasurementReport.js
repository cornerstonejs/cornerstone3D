import { normalizers, data, utilities, derivations } from "dcmjs";

import { toArray, codeMeaningEquals } from "../helpers";

const { TID1500, addAccessors } = utilities;

const { StructuredReport } = derivations;

const { Normalizer } = normalizers;

const { TID1500MeasurementReport, TID1501MeasurementGroup } = TID1500;

const { DicomMetaDictionary } = data;

const FINDING = { CodingSchemeDesignator: "DCM", CodeValue: "121071" };
const FINDING_SITE = { CodingSchemeDesignator: "SCT", CodeValue: "363698007" };
const FINDING_SITE_OLD = { CodingSchemeDesignator: "SRT", CodeValue: "G-C0E3" };

const codeValueMatch = (group, code, oldCode) => {
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
    toolClass
) {
    const args = toolClass.getTID300RepresentationArguments(tool);
    args.ReferencedSOPSequence = ReferencedSOPSequence;

    const TID300Measurement = new toolClass.TID300Representation(args);

    return TID300Measurement;
}

function getMeasurementGroup(toolType, toolData, ReferencedSOPSequence) {
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
            toolClass
        );
    });

    return new TID1501MeasurementGroup(Measurements);
}

export default class MeasurementReport {
    static getSetupMeasurementData(MeasurementGroup) {
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

        const defaultState = {
            sopInstanceUid: ReferencedSOPInstanceUID,
            frameIndex: ReferencedFrameNumber || 1,
            complete: true,
            finding: findingGroup
                ? addAccessors(findingGroup.ConceptCodeSequence)
                : undefined,
            findingSites: findingSiteGroups.map(fsg => {
                return addAccessors(fsg.ConceptCodeSequence);
            })
        };
        if (defaultState.finding) {
            defaultState.description = defaultState.finding.CodeMeaning;
        }
        const findingSite =
            defaultState.findingSites && defaultState.findingSites[0];
        if (findingSite) {
            defaultState.location =
                (findingSite[0] && findingSite[0].CodeMeaning) ||
                findingSite.CodeMeaning;
        }
        return {
            defaultState,
            findingGroup,
            findingSiteGroups,
            NUMGroup,
            SCOORDGroup,
            ReferencedSOPSequence,
            ReferencedSOPInstanceUID,
            ReferencedFrameNumber
        };
    }

    static generateReport(toolState, metadataProvider, options) {
        // ToolState for array of imageIDs to a Report
        // Assume Cornerstone metadata provider has access to Study / Series / Sop Instance UID

        let allMeasurementGroups = [];
        const firstImageId = Object.keys(toolState)[0];
        if (!firstImageId) {
            throw new Error("No measurements provided.");
        }

        /* Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Date
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Time
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study ID
         */
        const generalSeriesModule = metadataProvider.get(
            "generalSeriesModule",
            firstImageId
        );

        //const sopCommonModule = metadataProvider.get('sopCommonModule', firstImageId);

        // NOTE: We are getting the Series and Study UIDs from the first imageId of the toolState
        // which means that if the toolState is for multiple series, the report will have the incorrect
        // SeriesInstanceUIDs
        const { studyInstanceUID, seriesInstanceUID } = generalSeriesModule;

        // Loop through each image in the toolData
        Object.keys(toolState).forEach(imageId => {
            const sopCommonModule = metadataProvider.get(
                "sopCommonModule",
                imageId
            );
            const frameNumber = metadataProvider.get("frameNumber", imageId);
            const toolData = toolState[imageId];
            const toolTypes = Object.keys(toolData);

            const ReferencedSOPSequence = {
                ReferencedSOPClassUID: sopCommonModule.sopClassUID,
                ReferencedSOPInstanceUID: sopCommonModule.sopInstanceUID
            };

            if (
                Normalizer.isMultiframeSOPClassUID(sopCommonModule.sopClassUID)
            ) {
                ReferencedSOPSequence.ReferencedFrameNumber = frameNumber;
            }

            // Loop through each tool type for the image
            const measurementGroups = [];

            toolTypes.forEach(toolType => {
                const group = getMeasurementGroup(
                    toolType,
                    toolData,
                    ReferencedSOPSequence
                );
                if (group) {
                    measurementGroups.push(group);
                }
            });

            allMeasurementGroups =
                allMeasurementGroups.concat(measurementGroups);
        });

        const MeasurementReport = new TID1500MeasurementReport(
            { TID1501MeasurementGroups: allMeasurementGroups },
            options
        );

        // TODO: what is the correct metaheader
        // http://dicom.nema.org/medical/Dicom/current/output/chtml/part10/chapter_7.html
        // TODO: move meta creation to happen in derivations.js
        const fileMetaInformationVersionArray = new Uint8Array(2);
        fileMetaInformationVersionArray[1] = 1;

        const derivationSourceDataset = {
            StudyInstanceUID: studyInstanceUID,
            SeriesInstanceUID: seriesInstanceUID
            //SOPInstanceUID: sopInstanceUID, // TODO: Necessary?
            //SOPClassUID: sopClassUID,
        };

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

        const _vrMap = {
            PixelData: "OW"
        };

        derivationSourceDataset._meta = _meta;
        derivationSourceDataset._vrMap = _vrMap;

        const report = new StructuredReport([derivationSourceDataset]);

        const contentItem = MeasurementReport.contentItem(
            derivationSourceDataset
        );

        // Merge the derived dataset with the content from the Measurement Report
        report.dataset = Object.assign(report.dataset, contentItem);
        report.dataset._meta = _meta;

        return report;
    }

    /**
     * Generate Cornerstone tool state from dataset
     * @param {object} dataset dataset
     * @param {object} hooks
     * @param {function} hooks.getToolClass Function to map dataset to a tool class
     * @returns
     */
    static generateToolState(dataset, hooks = {}) {
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

            const toolClass = hooks.getToolClass
                ? hooks.getToolClass(
                      measurementGroup,
                      dataset,
                      registeredToolClasses
                  )
                : registeredToolClasses.find(tc =>
                      tc.isValidCornerstoneTrackingIdentifier(
                          TrackingIdentifierValue
                      )
                  );

            if (toolClass) {
                const measurement =
                    toolClass.getMeasurementData(measurementGroup);

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

MeasurementReport.MEASUREMENT_BY_TOOLTYPE = {};
MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE = {};
MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_TOOL_TYPE = {};
