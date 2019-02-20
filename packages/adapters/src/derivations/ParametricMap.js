import { DicomMetaDictionary } from "../DicomMetaDictionary.js";
import DerivedDataset from "./DerivedDataset.js";

export default class ParametricMap extends DerivedDataset {
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
