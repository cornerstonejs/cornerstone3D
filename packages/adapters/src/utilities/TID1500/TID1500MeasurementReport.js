import addAccessors from "../addAccessors";

export default class TID1500MeasurementReport {
    constructor(TIDIncludeGroups) {
        this.TIDIncludeGroups = TIDIncludeGroups;

        const ImageLibraryContentSequence = [];
        const CurrentRequestedProcedureEvidenceSequence = [];

        this.ImageLibraryContentSequence = ImageLibraryContentSequence;
        this.CurrentRequestedProcedureEvidenceSequence = CurrentRequestedProcedureEvidenceSequence;

        this.PersonObserverName = {
            RelationshipType: "HAS OBS CONTEXT",
            ValueType: "PNAME",
            ConceptNameCodeSequence: {
                CodeValue: "121008",
                CodingSchemeDesignator: "DCM",
                CodeMeaning: "Person Observer Name"
            },
            PersonName: "unknown^unknown"
        };

        this.tid1500 = {
            ConceptNameCodeSequence: {
                CodeValue: "126000",
                CodingSchemeDesignator: "DCM",
                CodeMeaning: "Imaging Measurement Report"
            },
            ContinuityOfContent: "SEPARATE",
            PerformedProcedureCodeSequence: [],
            CompletionFlag: "COMPLETE",
            VerificationFlag: "UNVERIFIED",
            ReferencedPerformedProcedureStepSequence: [],
            InstanceNumber: 1,
            CurrentRequestedProcedureEvidenceSequence,
            CodingSchemeIdentificationSequence: {
                CodingSchemeDesignator: "99dcmjs",
                CodingSchemeName: "Codes used for dcmjs",
                CodingSchemeVersion: "0",
                CodingSchemeResponsibleOrganization:
                    "https://github.com/dcmjs-org/dcmjs"
            },
            ContentTemplateSequence: {
                MappingResource: "DCMR",
                TemplateIdentifier: "1500"
            },
            ContentSequence: [
                {
                    RelationshipType: "HAS CONCEPT MOD",
                    ValueType: "CODE",
                    ConceptNameCodeSequence: addAccessors({
                        CodeValue: "121049",
                        CodingSchemeDesignator: "DCM",
                        CodeMeaning: "Language of Content Item and Descendants"
                    }),
                    ConceptCodeSequence: addAccessors({
                        CodeValue: "eng",
                        CodingSchemeDesignator: "RFC5646",
                        CodeMeaning: "English"
                    }),
                    ContentSequence: addAccessors({
                        RelationshipType: "HAS CONCEPT MOD",
                        ValueType: "CODE",
                        ConceptNameCodeSequence: addAccessors({
                            CodeValue: "121046",
                            CodingSchemeDesignator: "DCM",
                            CodeMeaning: "Country of Language"
                        }),
                        ConceptCodeSequence: addAccessors({
                            CodeValue: "US",
                            CodingSchemeDesignator: "ISO3166_1",
                            CodeMeaning: "United States"
                        })
                    })
                },
                this.PersonObserverName,
                {
                    RelationshipType: "HAS CONCEPT MOD",
                    ValueType: "CODE",
                    ConceptNameCodeSequence: addAccessors({
                        CodeValue: "121058",
                        CodingSchemeDesignator: "DCM",
                        CodeMeaning: "Procedure reported"
                    }),
                    ConceptCodeSequence: addAccessors({
                        CodeValue: "1",
                        CodingSchemeDesignator: "99dcmjs",
                        CodeMeaning: "Unknown procedure"
                    })
                },
                {
                    RelationshipType: "CONTAINS",
                    ValueType: "CONTAINER",
                    ConceptNameCodeSequence: {
                        CodeValue: "111028",
                        CodingSchemeDesignator: "DCM",
                        CodeMeaning: "Image Library"
                    },
                    ContinuityOfContent: "SEPARATE",
                    ContentSequence: {
                        RelationshipType: "CONTAINS",
                        ValueType: "CONTAINER",
                        ConceptNameCodeSequence: {
                            CodeValue: "126200",
                            CodingSchemeDesignator: "DCM",
                            CodeMeaning: "Image Library Group"
                        },
                        ContinuityOfContent: "SEPARATE",
                        ContentSequence: ImageLibraryContentSequence
                    }
                }
            ]
        };
    }

    validate() {}

    contentItem(derivationSourceDatasetOrDatasets, options = {}) {
        if (options.PersonName) {
            this.PersonObserverName.PersonName = options.PersonName;
        }

        // Note this is left in for compatibility with the Cornerstone Legacy adapter which only supports one series for now.
        const derivationSourceDatasets = Array.isArray(
            derivationSourceDatasetOrDatasets
        )
            ? derivationSourceDatasetOrDatasets
            : [derivationSourceDatasetOrDatasets];

        // Add the Measurement Groups to the Measurement Report
        this.addTID1501MeasurementGroups(derivationSourceDatasets, options);

        return this.tid1500;
    }

    addTID1501MeasurementGroups(derivationSourceDatasets, options = {}) {
        const {
            CurrentRequestedProcedureEvidenceSequence,
            ImageLibraryContentSequence
        } = this;

        const { sopInstanceUIDsToSeriesInstanceUIDMap } = options;

        if (
            derivationSourceDatasets.length > 1 &&
            sopInstanceUIDsToSeriesInstanceUIDMap === undefined
        ) {
            throw new Error(
                `addTID1501MeasurementGroups provided with ${derivationSourceDatasets.length} derivationSourceDatasets, with no sopInstanceUIDsToSeriesInstanceUIDMap in options.`
            );
        }

        const { TID1501MeasurementGroups } = this.TIDIncludeGroups;

        if (!TID1501MeasurementGroups) {
            return;
        }

        let ContentSequence = [];

        TID1501MeasurementGroups.forEach(child => {
            ContentSequence = ContentSequence.concat(child.contentItem());
        });

        const parsedSOPInstances = [];

        // For each measurement that is referenced, add a link to the
        // Image Library Group and the Current Requested Procedure Evidence
        // with the proper ReferencedSOPSequence
        TID1501MeasurementGroups.forEach(measurementGroup => {
            measurementGroup.TID300Measurements.forEach(measurement => {
                const {
                    ReferencedSOPInstanceUID
                } = measurement.ReferencedSOPSequence;

                if (!parsedSOPInstances.includes(ReferencedSOPInstanceUID)) {
                    ImageLibraryContentSequence.push({
                        RelationshipType: "CONTAINS",
                        ValueType: "IMAGE",
                        ReferencedSOPSequence: measurement.ReferencedSOPSequence
                    });

                    let derivationSourceDataset;

                    if (derivationSourceDatasets.length === 1) {
                        // If there is only one derivationSourceDataset, use it.
                        derivationSourceDataset = derivationSourceDatasets[0];
                    } else {
                        const SeriesInstanceUID =
                            sopInstanceUIDsToSeriesInstanceUIDMap[
                                ReferencedSOPInstanceUID
                            ];

                        derivationSourceDataset = derivationSourceDatasets.find(
                            dsd => dsd.SeriesInstanceUID === SeriesInstanceUID
                        );
                    }

                    /**
                     * Note: the VM of the ReferencedSeriesSequence and ReferencedSOPSequence are 1, so
                     * it is correct that we have a full `CurrentRequestedProcedureEvidenceSequence`
                     * item per `SOPInstanceUID`.
                     */
                    CurrentRequestedProcedureEvidenceSequence.push({
                        StudyInstanceUID:
                            derivationSourceDataset.StudyInstanceUID,
                        ReferencedSeriesSequence: {
                            SeriesInstanceUID:
                                derivationSourceDataset.SeriesInstanceUID,
                            ReferencedSOPSequence:
                                measurement.ReferencedSOPSequence
                        }
                    });

                    parsedSOPInstances.push(ReferencedSOPInstanceUID);
                }
            });
        });

        const ImagingMeasurments = {
            RelationshipType: "CONTAINS",
            ValueType: "CONTAINER",
            ConceptNameCodeSequence: {
                CodeValue: "126010",
                CodingSchemeDesignator: "DCM",
                CodeMeaning: "Imaging Measurements" // TODO: would be nice to abstract the code sequences (in a dictionary? a service?)
            },
            ContinuityOfContent: "SEPARATE",
            ContentSequence
        };

        this.tid1500.ContentSequence.push(ImagingMeasurments);
    }
}
