import { DicomMetaDictionary } from "../DicomMetaDictionary.js";
import DerivedPixels from "./DerivedPixels";
import DerivedDataset from "./DerivedDataset";
import { Normalizer } from "../normalizers.js";
import { BitArray } from "../bitArray.js";

export default class Segmentation extends DerivedPixels {
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
            ContentLabel: "SEGMENTATION"
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
                    ReferencedSOPClassUID:
                        this.referencedDatasets[i].SOPClassUID,
                    ReferencedSOPInstanceUID:
                        this.referencedDatasets[i].SOPInstanceUID
                });
            }

            this.dataset.ReferencedSeriesSequence = {
                SeriesInstanceUID: this.referencedDataset.SeriesInstanceUID,
                StudyInstanceUID: this.referencedDataset.StudyInstanceUID,
                ReferencedInstanceSequence
            };
        }

        if (!this.options.includeSliceSpacing) {
            // per dciodvfy this should not be included, but dcmqi/Slicer requires it
            delete this.dataset.SharedFunctionalGroupsSequence
                .PixelMeasuresSequence.SpacingBetweenSlices;
        }

        if (
            this.dataset.SharedFunctionalGroupsSequence
                .PixelValueTransformationSequence
        ) {
            // If derived from a CT, this shouldn't be left in the SEG.
            delete this.dataset.SharedFunctionalGroupsSequence
                .PixelValueTransformationSequence;
        }

        // The pixelData array needs to be defined once you know how many frames you'll have.
        this.dataset.PixelData = undefined;
        this.dataset.NumberOfFrames = 0;

        this.dataset.PerFrameFunctionalGroupsSequence = [];
    }

    /**
     * setNumberOfFrames - Sets the number of frames of the segmentation object
     * and allocates (non-bitpacked) memory for the PixelData for constuction.
     *
     * @param  {type} NumberOfFrames The number of segmentation frames.
     */
    setNumberOfFrames(NumberOfFrames) {
        const dataset = this.dataset;
        dataset.NumberOfFrames = NumberOfFrames;

        dataset.PixelData = new ArrayBuffer(
            dataset.Rows * dataset.Columns * NumberOfFrames
        );
    }

    /**
     * bitPackPixelData - Bitpacks the pixeldata, should be called after all
     * segments are addded.
     *
     * @returns {type}  description
     */
    bitPackPixelData() {
        if (this.isBitpacked) {
            console.warn(
                `This.bitPackPixelData has already been called, it should only be called once, when all frames have been added. Exiting.`
            );
        }

        const dataset = this.dataset;
        const unpackedPixelData = dataset.PixelData;
        const uInt8ViewUnpackedPixelData = new Uint8Array(unpackedPixelData);
        const bitPackedPixelData = BitArray.pack(uInt8ViewUnpackedPixelData);

        dataset.PixelData = bitPackedPixelData.buffer;

        this.isBitpacked = true;
    }

    /**
     * addSegmentFromLabelmap - Adds a segment to the dataset,
     * where the labelmaps are a set of 2D labelmaps, from which to extract the binary maps.
     *
     * @param  {type} Segment   The segment metadata.
     * @param  {Uint8Array[]} labelmaps labelmap arrays for each index of referencedFrameNumbers.
     * @param  {number}  segmentIndexInLabelmap The segment index to extract from the labelmap
     *    (might be different to the segment metadata depending on implementation).
     * @param  {number[]} referencedFrameNumbers  The frames that the
     *                                            segmentation references.
     *
     */
    addSegmentFromLabelmap(
        Segment,
        labelmaps,
        segmentIndexInLabelmap,
        referencedFrameNumbers
    ) {
        if (this.dataset.NumberOfFrames === 0) {
            throw new Error(
                "Must set the total number of frames via setNumberOfFrames() before adding segments to the segmentation."
            );
        }

        this._addSegmentPixelDataFromLabelmaps(
            labelmaps,
            segmentIndexInLabelmap
        );
        const ReferencedSegmentNumber = this._addSegmentMetadata(Segment);
        this._addPerFrameFunctionalGroups(
            ReferencedSegmentNumber,
            referencedFrameNumbers
        );
    }

    _addSegmentPixelDataFromLabelmaps(labelmaps, segmentIndex) {
        const dataset = this.dataset;
        const existingFrames = dataset.PerFrameFunctionalGroupsSequence.length;
        const sliceLength = dataset.Rows * dataset.Columns;
        const byteOffset = existingFrames * sliceLength;

        const pixelDataUInt8View = new Uint8Array(
            dataset.PixelData,
            byteOffset,
            labelmaps.length * sliceLength
        );

        const occupiedValue = this._getOccupiedValue();

        for (let l = 0; l < labelmaps.length; l++) {
            const labelmap = labelmaps[l];

            for (let i = 0; i < labelmap.length; i++) {
                if (labelmap[i] === segmentIndex) {
                    pixelDataUInt8View[l * sliceLength + i] = occupiedValue;
                }
            }
        }
    }

    _getOccupiedValue() {
        if (this.dataset.SegmentationType === "FRACTIONAL") {
            return 255;
        }

        return 1;
    }

    /**
     * addSegment - Adds a segment to the dataset.
     *
     * @param  {type} Segment   The segment metadata.
     * @param  {Uint8Array} pixelData The pixelData array containing all frames
     *                                of the segmentation.
     * @param  {Number[]} referencedFrameNumbers  The frames that the
     *                                            segmentation references.
     *
     */
    addSegment(Segment, pixelData, referencedFrameNumbers) {
        if (this.dataset.NumberOfFrames === 0) {
            throw new Error(
                "Must set the total number of frames via setNumberOfFrames() before adding segments to the segmentation."
            );
        }

        this._addSegmentPixelData(pixelData);
        const ReferencedSegmentNumber = this._addSegmentMetadata(Segment);
        this._addPerFrameFunctionalGroups(
            ReferencedSegmentNumber,
            referencedFrameNumbers
        );
    }

    _addSegmentPixelData(pixelData) {
        const dataset = this.dataset;

        const existingFrames = dataset.PerFrameFunctionalGroupsSequence.length;
        const sliceLength = dataset.Rows * dataset.Columns;
        const byteOffset = existingFrames * sliceLength;

        const pixelDataUInt8View = new Uint8Array(
            dataset.PixelData,
            byteOffset,
            pixelData.length
        );

        for (let i = 0; i < pixelData.length; i++) {
            pixelDataUInt8View[i] = pixelData[i];
        }
    }

    _addPerFrameFunctionalGroups(
        ReferencedSegmentNumber,
        referencedFrameNumbers
    ) {
        const PerFrameFunctionalGroupsSequence =
            this.dataset.PerFrameFunctionalGroupsSequence;

        const ReferencedSeriesSequence =
            this.referencedDataset.ReferencedSeriesSequence;

        for (let i = 0; i < referencedFrameNumbers.length; i++) {
            const frameNumber = referencedFrameNumbers[i];

            const perFrameFunctionalGroups = {};

            perFrameFunctionalGroups.PlanePositionSequence =
                DerivedDataset.copyDataset(
                    this.referencedDataset.PerFrameFunctionalGroupsSequence[
                        frameNumber - 1
                    ].PlanePositionSequence
                );

            // If the PlaneOrientationSequence is not in the SharedFunctionalGroupsSequence,
            // extract it from the PerFrameFunctionalGroupsSequence.
            if (
                !this.dataset.SharedFunctionalGroupsSequence
                    .PlaneOrientationSequence
            ) {
                perFrameFunctionalGroups.PlaneOrientationSequence =
                    DerivedDataset.copyDataset(
                        this.referencedDataset.PerFrameFunctionalGroupsSequence[
                            frameNumber - 1
                        ].PlaneOrientationSequence
                    );
            }

            perFrameFunctionalGroups.FrameContentSequence = {
                DimensionIndexValues: [ReferencedSegmentNumber, frameNumber]
            };

            perFrameFunctionalGroups.SegmentIdentificationSequence = {
                ReferencedSegmentNumber
            };

            let ReferencedSOPClassUID;
            let ReferencedSOPInstanceUID;
            let ReferencedFrameNumber;

            if (ReferencedSeriesSequence) {
                const referencedInstanceSequenceI =
                    ReferencedSeriesSequence.ReferencedInstanceSequence[
                        frameNumber - 1
                    ];

                ReferencedSOPClassUID =
                    referencedInstanceSequenceI.ReferencedSOPClassUID;
                ReferencedSOPInstanceUID =
                    referencedInstanceSequenceI.ReferencedSOPInstanceUID;

                if (Normalizer.isMultiframeSOPClassUID(ReferencedSOPClassUID)) {
                    ReferencedFrameNumber = frameNumber;
                }
            } else {
                ReferencedSOPClassUID = this.referencedDataset.SOPClassUID;
                ReferencedSOPInstanceUID =
                    this.referencedDataset.SOPInstanceUID;
                ReferencedFrameNumber = frameNumber;
            }

            if (ReferencedFrameNumber) {
                perFrameFunctionalGroups.DerivationImageSequence = {
                    SourceImageSequence: {
                        ReferencedSOPClassUID,
                        ReferencedSOPInstanceUID,
                        ReferencedFrameNumber,
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
            } else {
                perFrameFunctionalGroups.DerivationImageSequence = {
                    SourceImageSequence: {
                        ReferencedSOPClassUID,
                        ReferencedSOPInstanceUID,
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
            }

            PerFrameFunctionalGroupsSequence.push(perFrameFunctionalGroups);
        }
    }

    _addSegmentMetadata(Segment) {
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
        Segment.SegmentAlgorithmType =
            Segment.SegmentAlgorithmType.toUpperCase();

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
                    `SegmentAlgorithmType ${Segment.SegmentAlgorithmType} invalid.`
                );
        }

        // Deep copy, so we don't change the segment index stored in cornerstoneTools.

        const SegmentSequence = this.dataset.SegmentSequence;

        const SegmentAlgorithmType = Segment.SegmentAlgorithmType;

        const reNumberedSegmentCopy = {
            SegmentedPropertyCategoryCodeSequence:
                Segment.SegmentedPropertyCategoryCodeSequence,
            SegmentNumber: (SegmentSequence.length + 1).toString(),
            SegmentLabel: Segment.SegmentLabel,
            SegmentAlgorithmType,
            RecommendedDisplayCIELabValue:
                Segment.RecommendedDisplayCIELabValue,
            SegmentedPropertyTypeCodeSequence:
                Segment.SegmentedPropertyTypeCodeSequence
        };

        if (
            SegmentAlgorithmType === "AUTOMATIC" ||
            SegmentAlgorithmType === "SEMIAUTOMATIC"
        ) {
            reNumberedSegmentCopy.SegmentAlgorithmName =
                Segment.SegmentAlgorithmName;
        }

        SegmentSequence.push(reNumberedSegmentCopy);

        return reNumberedSegmentCopy.SegmentNumber;
    }
}
