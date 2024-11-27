import { data as dcmjsData, normalizers } from "dcmjs";

const { DicomMessage, DicomMetaDictionary } = dcmjsData;
const { Normalizer } = normalizers;

/**
 * Convert an array of cornerstone images into datasets
 *
 * @param  images - An array of the cornerstone image objects
 * @param isMultiframe - Whether the images are multiframe
 * @param options - Options object that may contain:
 *   - SpecificCharacterSet: character set to be set to each dataset
 */
export default function getDatasetsFromImages(images, isMultiframe, options?) {
    const datasets = [];

    if (isMultiframe) {
        const image = images[0];
        const arrayBuffer = image.data.byteArray.buffer;

        const dicomData = DicomMessage.readFile(arrayBuffer);
        const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);

        dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
        datasets.push(dataset);
    } else {
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const arrayBuffer = image.data.byteArray.buffer;
            const dicomData = DicomMessage.readFile(arrayBuffer);
            const dataset = DicomMetaDictionary.naturalizeDataset(
                dicomData.dict
            );

            dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
            datasets.push(dataset);
        }
    }

    if (options?.SpecificCharacterSet) {
        datasets.forEach(
            dataset =>
                (dataset.SpecificCharacterSet = options.SpecificCharacterSet)
        );
    }

    return Normalizer.normalizeToDataset(datasets);
}
