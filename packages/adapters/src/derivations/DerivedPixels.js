import { DicomMetaDictionary } from "../DicomMetaDictionary.js";
import DerivedDataset from "./DerivedDataset";

export default class DerivedPixels extends DerivedDataset {
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
            this.dataset.SharedFunctionalGroupsSequence =
                DerivedDataset.copyDataset(
                    this.referencedDataset.SharedFunctionalGroupsSequence
                );
        }
        if (this.referencedDataset.PerFrameFunctionalGroupsSequence) {
            this.dataset.PerFrameFunctionalGroupsSequence =
                DerivedDataset.copyDataset(
                    this.referencedDataset.PerFrameFunctionalGroupsSequence
                );
        }

        // make an array of zeros for the pixels
        this.dataset.PixelData = new ArrayBuffer(
            this.referencedDataset.PixelData.byteLength
        );
    }
}
