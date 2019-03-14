import DerivedDataset from "./DerivedDataset";
import { DicomMetaDictionary } from "../DicomMetaDictionary";

export default class StructuredReport extends DerivedDataset {
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
