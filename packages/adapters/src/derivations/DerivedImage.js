import DerivedPixels from "./DerivedPixels";

export default class DerivedImage extends DerivedPixels {
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
