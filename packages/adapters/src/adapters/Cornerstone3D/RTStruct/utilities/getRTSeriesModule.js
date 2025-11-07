import dcmjs from "dcmjs";
import { copySeriesTags } from "../../../helpers";

const { DicomMetaDictionary } = dcmjs.data;

export default function getRTSeriesModule(rtMetadata, predecessorInstance) {
    const result = {
        SeriesInstanceUID:
            predecessorInstance?.SeriesInstanceUID || DicomMetaDictionary.uid(), // generate a new series instance uid
        SeriesNumber: rtMetadata.SeriesNumber || "3100",
        SeriesDescription: rtMetadata.SeriesDescription || ""
    };
    if (predecessorInstance) {
        const seriesTags = copySeriesTags(predecessorInstance);
        Object.assign(result, seriesTags);
        seriesTags.InstanceNumber = String(
            1 + Number(seriesTags.InstanceNumber)
        );
    }
    return result;
}
