import { DicomMetaDictionary } from "./DicomMetaDictionary.js";

class DerivedDataset {
    constructor(datasets, options = {}) {
        this.options = JSON.parse(JSON.stringify(options));
        let o = this.options;

        o.Manufacturer = options.Manufacturer || "Unspecified";
        o.ManufacturerModelName =
            options.ManufacturerModelName || "Unspecified";
        o.SeriesDescription =
            options.SeriesDescription || "Research Derived series";
        o.SeriesNumber = options.SeriesNumber || "99";
        o.SoftwareVersions = options.SoftwareVersions || "0";
        o.DeviceSerialNumber = options.DeviceSerialNumber || "1";

        let date = DicomMetaDictionary.date();
        let time = DicomMetaDictionary.time();

        o.SeriesDate = options.SeriesDate || date;
        o.SeriesTime = options.SeriesTime || time;
        o.ContentDate = options.ContentDate || date;
        o.ContentTime = options.ContentTime || time;

        o.SOPInstanceUID = options.SOPInstanceUID || DicomMetaDictionary.uid();
        o.SeriesInstanceUID =
            options.SeriesInstanceUID || DicomMetaDictionary.uid();

        o.ClinicalTrialTimePointID = options.ClinicalTrialTimePointID || "";
        o.ClinicalTrialCoordinatingCenterName =
            options.ClinicalTrialCoordinatingCenterName || "";
        o.ClinicalTrialSeriesID = options.ClinicalTrialSeriesID || "";

        o.ImageComments = options.ImageComments || "NOT FOR CLINICAL USE";
        o.ContentQualification = "RESEARCH";

        this.referencedDatasets = datasets; // list of one or more dicom-like object instances
        this.referencedDataset = this.referencedDatasets[0];
        this.dataset = {
            _vrMap: this.referencedDataset._vrMap,
            _meta: this.referencedDataset._meta
        };

        this.derive();
    }

    assignToDataset(data) {
        Object.keys(data).forEach(key => (this.dataset[key] = data[key]));
    }

    assignFromReference(tags) {
        tags.forEach(
            tag => (this.dataset[tag] = this.referencedDataset[tag] || "")
        );
    }

    assignFromOptions(tags) {
        tags.forEach(tag => (this.dataset[tag] = this.options[tag] || ""));
    }

    derive() {
        // common for all instances in study
        this.assignFromReference([
            "AccessionNumber",
            "ReferringPhysicianName",
            "StudyDate",
            "StudyID",
            "StudyTime",
            "PatientName",
            "PatientID",
            "PatientBirthDate",
            "PatientSex",
            "PatientAge",
            "StudyInstanceUID",
            "StudyID"
        ]);

        this.assignFromOptions([
            "Manufacturer",
            "SoftwareVersions",
            "DeviceSerialNumber",
            "ManufacturerModelName",
            "SeriesDescription",
            "SeriesNumber",
            "ImageComments",
            "SeriesDate",
            "SeriesTime",
            "ContentDate",
            "ContentTime",
            "ContentQualification",
            "SOPInstanceUID",
            "SeriesInstanceUID"
        ]);
    }

    static copyDataset(dataset) {
        // copies everything but the buffers
        return JSON.parse(JSON.stringify(dataset));
    }
}

class DerivedPixels extends DerivedDataset {
    constructor(datasets, options = {}) {
        super(datasets, options);
        let o = this.options;

        o.ContentLabel = options.ContentLabel || "";
        o.ContentDescription = options.ContentDescription || "";
        o.ContentCreatorName = options.ContentCreatorName || "";
    }

    // this assumes a normalized multiframe input and will create
    // a multiframe derived image
    derive() {
        super.derive();

        this.assignToDataset({
            ImageType: ["DERIVED", "PRIMARY"],
            LossyImageCompression: "00",
            InstanceNumber: "1"
        });

        this.assignFromReference([
            "SOPClassUID",
            "Modality",
            "FrameOfReferenceUID",
            "PositionReferenceIndicator",
            "NumberOfFrames",
            "Rows",
            "Columns",
            "SamplesPerPixel",
            "PhotometricInterpretation",
            "BitsStored",
            "HighBit"
        ]);

        this.assignFromOptions([
            "ContentLabel",
            "ContentDescription",
            "ContentCreatorName"
        ]);

        //
        // TODO: more carefully copy only PixelMeasures and related
        // TODO: add derivation references
        //
        if (this.referencedDataset.SharedFunctionalGroupsSequence) {
            this.dataset.SharedFunctionalGroupsSequence = DerivedDataset.copyDataset(
                this.referencedDataset.SharedFunctionalGroupsSequence
            );
        }
        if (this.referencedDataset.PerFrameFunctionalGroupsSequence) {
            this.dataset.PerFrameFunctionalGroupsSequence = DerivedDataset.copyDataset(
                this.referencedDataset.PerFrameFunctionalGroupsSequence
            );
        }

        // make an array of zeros for the pixels
        this.dataset.PixelData = new ArrayBuffer(
            this.referencedDataset.PixelData.byteLength
        );
    }
}

class DerivedImage extends DerivedPixels {
    constructor(datasets, options = {}) {
        super(datasets, options);
    }

    derive() {
        super.derive();
        this.assignFromReference([
            "WindowCenter",
            "WindowWidth",
            "BitsAllocated",
            "PixelRepresentation",
            "BodyPartExamined",
            "Laterality",
            "PatientPosition",
            "RescaleSlope",
            "RescaleIntercept",
            "PixelPresentation",
            "VolumetricProperties",
            "VolumeBasedCalculationTechnique",
            "PresentationLUTShape"
        ]);
    }
}

class Segmentation extends DerivedPixels {
    constructor(datasets, options = { includeSliceSpacing: true }) {
        super(datasets, options);
    }

    derive() {
        super.derive();

        this.assignToDataset({
            SOPClassUID: DicomMetaDictionary.sopClassUIDsByName.Segmentation,
            Modality: "SEG",
            SamplesPerPixel: "1",
            PhotometricInterpretation: "MONOCHROME2",
            BitsAllocated: "1",
            BitsStored: "1",
            HighBit: "0",
            PixelRepresentation: "0",
            LossyImageCompression: "00",
            SegmentationType: "BINARY",
            ContentLabel: "EXAMPLE"
        });

        let dimensionUID = DicomMetaDictionary.uid();
        this.dataset.DimensionOrganizationSequence = {
            DimensionOrganizationUID: dimensionUID
        };
        this.dataset.DimensionIndexSequence = [
            {
                DimensionOrganizationUID: dimensionUID,
                DimensionIndexPointer: 6422539,
                FunctionalGroupPointer: 6422538, // SegmentIdentificationSequence
                DimensionDescriptionLabel: "ReferencedSegmentNumber"
            },
            {
                DimensionOrganizationUID: dimensionUID,
                DimensionIndexPointer: 2097202,
                FunctionalGroupPointer: 2134291, // PlanePositionSequence
                DimensionDescriptionLabel: "ImagePositionPatient"
            }
        ];

        this.dataset.SegmentSequence = [];

        // TODO: check logic here.
        // If the referenced dataset itself references a series, then copy.
        // Otherwise, reference the dataset itself.
        // This should allow Slicer and others to get the correct original
        // images when loading Legacy Converted Images, but it's a workaround
        // that really doesn't belong here.
        if (this.referencedDataset.ReferencedSeriesSequence) {
            this.dataset.ReferencedSeriesSequence = DerivedDataset.copyDataset(
                this.referencedDataset.ReferencedSeriesSequence
            );
        } else {
            const ReferencedInstanceSequence = [];

            for (let i = 0; i < this.referencedDatasets.length; i++) {
                ReferencedInstanceSequence.push({
                    ReferencedSOPClassUID: this.referencedDatasets[i]
                        .SOPClassUID,
                    ReferencedSOPInstanceUID: this.referencedDatasets[i]
                        .SOPInstanceUID
                });
            }

            this.dataset.ReferencedSeriesSequence = {
                SeriesInstanceUID: this.referencedDataset.SeriesInstanceUID,
                StudyInstanceUID: this.referencedDataset.StudyInstanceUID,
                ReferencedInstanceSequence
            };
        }

        // handle the case of a converted multiframe, so point to original source
        // TODO: only a single segment is created now
        for (
            let frameIndex = 0;
            frameIndex < this.dataset.NumberOfFrames;
            frameIndex++
        ) {
            this.dataset.PerFrameFunctionalGroupsSequence[
                frameIndex
            ].DerivationImageSequence = {
                SourceImageSequence: {
                    ReferencedSOPClassUID: this.referencedDataset.SOPClassUID,
                    ReferencedSOPInstanceUID: this.referencedDataset
                        .SOPInstanceUID,
                    ReferencedFrameNumber: frameIndex + 1,
                    PurposeOfReferenceCodeSequence: {
                        CodeValue: "121322",
                        CodingSchemeDesignator: "DCM",
                        CodeMeaning:
                            "Source image for image processing operation"
                    }
                },
                DerivationCodeSequence: {
                    CodeValue: "113076",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Segmentation"
                }
            };
            this.dataset.PerFrameFunctionalGroupsSequence[
                frameIndex
            ].FrameContentSequence = {
                DimensionIndexValues: [1, frameIndex + 1]
            };
            this.dataset.PerFrameFunctionalGroupsSequence[
                frameIndex
            ].SegmentIdentificationSequence = {
                ReferencedSegmentNumber: 1
            };
        }

        // these are copied with pixels, but don't belong in segmentation
        for (
            let frameIndex = 0;
            frameIndex < this.dataset.NumberOfFrames;
            frameIndex++
        ) {
            // TODO: instead explicitly copy the position sequence
            let group = this.dataset.PerFrameFunctionalGroupsSequence[
                frameIndex
            ];
            delete group.FrameVOILUTSequence;
        }

        if (!this.options.includeSliceSpacing) {
            // per dciodvfy this should not be included, but dcmqi/Slicer requires it
            delete this.dataset.SharedFunctionalGroupsSequence
                .PixelMeasuresSequence.SpacingBetweenSlices;
        }

        // make an array of zeros for the pixels assuming bit packing (one bit per short)
        // TODO: handle different packing and non-multiple of 8/16 rows and columns
        this.dataset.PixelData = new ArrayBuffer(
            this.referencedDataset.PixelData.byteLength / 16
        );
    }

    addSegment(Segment) {
        if (
            !Segment.SegmentLabel ||
            !Segment.SegmentedPropertyCategoryCodeSequence ||
            !Segment.SegmentedPropertyTypeCodeSequence ||
            !Segment.SegmentAlgorithmType
        ) {
            throw new Error(
                `Segment does not contain all the required fields.`
            );
        }

        // Capitalise the SegmentAlgorithmType if it happens to be given in
        // Lower/mixed case.
        Segment.SegmentAlgorithmType = Segment.SegmentAlgorithmType.toUpperCase();

        // Check SegmentAlgorithmType and SegmentAlgorithmName if necessary.
        switch (Segment.SegmentAlgorithmType) {
            case "AUTOMATIC":
            case "SEMIAUTOMATIC":
                if (!Segment.SegmentAlgorithmName) {
                    throw new Error(
                        `If the SegmentAlgorithmType is SEMIAUTOMATIC or AUTOMATIC,
            SegmentAlgorithmName must be provided`
                    );
                }

                break;
            case "MANUAL":
                break;
            default:
                throw new Error(
                    `SegmentAlgorithmType ${
                        Segment.SegmentAlgorithmType
                    } invalid.`
                );
        }

        const SegmentSequence = this.dataset.SegmentSequence;
        Segment.SegmentNumber = SegmentSequence.length + 1;

        SegmentSequence.push(Segment);
    }

    removeSegment(segmentNumber) {
        const SegmentSequence = this.dataset.SegmentSequence;

        // Remove the Segment
        SegmentSequence.splice(segmentNumber - 1, 1);

        // Alter the numbering of the following Segments.
        for (let i = segmentNumber - 1; i < SegmentSequence.length; i++) {
            SegmentSequence[i].SegmentNumber = i + 1;
        }
    }
}

class StructuredReport extends DerivedDataset {
    constructor(datasets, options = {}) {
        super(datasets, options);
    }

    // this assumes a normalized multiframe input and will create
    // a multiframe derived image
    derive() {
        super.derive();

        this.assignToDataset({
            SOPClassUID: DicomMetaDictionary.sopClassUIDsByName.EnhancedSR,
            Modality: "SR",
            ValueType: "CONTAINER"
        });

        this.assignFromReference([]);
    }
}

class ParametricMap extends DerivedDataset {
    constructor(datasets, options = {}) {
        super(datasets, options);
    }

    // this assumes a normalized multiframe input and will create
    // a multiframe derived image
    derive() {
        super.derive();

        this.assignToDataset({
            // TODO: ???
        });

        this.assignFromReference([]);
    }
}

export { DerivedDataset };
export { DerivedPixels };
export { DerivedImage };
export { Segmentation };
export { ParametricMap };
export { StructuredReport };
