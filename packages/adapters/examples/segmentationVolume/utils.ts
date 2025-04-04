import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneAdapters from "@cornerstonejs/adapters";
import dcmjs from "dcmjs";

const { cache, imageLoader, metaData } = cornerstone;
const { segmentation: csToolsSegmentation } = cornerstoneTools;
const { wadouri } = cornerstoneDicomImageLoader;
const { downloadDICOMData } = cornerstoneAdapters.helpers;
const { Cornerstone3D } = cornerstoneAdapters.adaptersSEG;

export async function readDicom(files: FileList, state) {
    for (const file of files) {
        const imageId = wadouri.fileManager.add(file);
        await imageLoader.loadAndCacheImage(imageId);
        state.referenceImageIds.push(imageId);
    }
}

export async function createEmptySegmentation(state) {
    const { referenceImageIds, segmentationId } = state;

    const derivedSegmentationImages =
        await imageLoader.createAndCacheDerivedLabelmapImages(
            referenceImageIds
        );

    const derivedSegmentationImageIds = derivedSegmentationImages.map(
        image => image.imageId
    );

    csToolsSegmentation.addSegmentations([
        {
            segmentationId,
            representation: {
                type: cornerstoneTools.Enums.SegmentationRepresentations
                    .Labelmap,
                data: {
                    imageIds: derivedSegmentationImageIds
                }
            }
        }
    ]);
}

export async function createSegmentation({ state, labelMapImages }) {
    const { segmentationId } = state;

    const imageIds = labelMapImages?.flat().map(image => image.imageId);

    csToolsSegmentation.addSegmentations([
        {
            segmentationId,
            representation: {
                type: cornerstoneTools.Enums.SegmentationRepresentations
                    .Labelmap,
                data: {
                    imageIds
                }
            }
        }
    ]);
}

export async function readSegmentation(file: File, state) {
    const imageId = wadouri.fileManager.add(file);
    const image = await imageLoader.loadAndCacheImage(imageId);

    if (!image) {
        return;
    }

    const instance = metaData.get("instance", imageId);

    if (instance.Modality !== "SEG") {
        console.error("This is not segmentation: " + file.name);
        return;
    }

    const arrayBuffer = image.data.byteArray.buffer;

    await loadSegmentation(arrayBuffer, state);
}

export async function loadSegmentation(arrayBuffer: ArrayBuffer, state) {
    const { referenceImageIds } = state;

    const { labelMapImages } =
        await Cornerstone3D.Segmentation.createFromDICOMSegBuffer(
            referenceImageIds,
            arrayBuffer,
            {
                metadataProvider: metaData
            }
        );

    await createSegmentation({ state, labelMapImages });
}

export async function exportSegmentation(state) {
    const { segmentationId, viewportIds } = state;
    const segmentationIds = getSegmentationIds();
    if (!segmentationIds.length) {
        return;
    }

    const segmentation =
        csToolsSegmentation.state.getSegmentation(segmentationId);

    const { imageIds } = segmentation.representationData.Labelmap;

    const segImages = imageIds.map(imageId => cache.getImage(imageId));
    const referencedImages = segImages.map(image =>
        cache.getImage(image.referencedImageId)
    );

    const labelmaps2D = [];

    let z = 0;

    for (const segImage of segImages) {
        const segmentsOnLabelmap = new Set();
        const pixelData = segImage.getPixelData();
        const { rows, columns } = segImage;

        for (let i = 0; i < pixelData.length; i++) {
            const segment = pixelData[i];
            if (segment !== 0) {
                segmentsOnLabelmap.add(segment);
            }
        }

        labelmaps2D[z++] = {
            segmentsOnLabelmap: Array.from(segmentsOnLabelmap),
            pixelData,
            rows,
            columns
        };
    }

    const allSegmentsOnLabelmap = labelmaps2D.map(
        labelmap => labelmap.segmentsOnLabelmap
    );

    const labelmap3D = {
        segmentsOnLabelmap: Array.from(new Set(allSegmentsOnLabelmap.flat())),
        metadata: [],
        labelmaps2D
    };

    labelmap3D.segmentsOnLabelmap.forEach(segmentIndex => {
        const color = csToolsSegmentation.config.color.getSegmentIndexColor(
            viewportIds[0],
            segmentationId,
            segmentIndex
        );
        const RecommendedDisplayCIELabValue = dcmjs.data.Colors.rgb2DICOMLAB(
            color.slice(0, 3).map(value => value / 255)
        ).map(value => Math.round(value));

        const segmentMetadata = {
            SegmentNumber: segmentIndex.toString(),
            SegmentLabel: `Segment ${segmentIndex}`,
            SegmentAlgorithmType: "MANUAL",
            SegmentAlgorithmName: "OHIF Brush",
            RecommendedDisplayCIELabValue,
            SegmentedPropertyCategoryCodeSequence: {
                CodeValue: "T-D0050",
                CodingSchemeDesignator: "SRT",
                CodeMeaning: "Tissue"
            },
            SegmentedPropertyTypeCodeSequence: {
                CodeValue: "T-D0050",
                CodingSchemeDesignator: "SRT",
                CodeMeaning: "Tissue"
            }
        };
        labelmap3D.metadata[segmentIndex] = segmentMetadata;
    });

    const generatedSegmentation =
        Cornerstone3D.Segmentation.generateSegmentation(
            referencedImages,
            labelmap3D,
            metaData
        );

    downloadDICOMData(generatedSegmentation.dataset, "mySEG.dcm");
}

export function restart(state) {
    const { volumeId } = state;

    if (!volumeId) {
        return;
    }

    cache.removeVolumeLoadObject(volumeId);

    csToolsSegmentation.removeAllSegmentationRepresentations();

    const segmentationIds = getSegmentationIds();
    segmentationIds.forEach(segmentationId => {
        csToolsSegmentation.state.removeSegmentation(segmentationId);
        cache.removeVolumeLoadObject(segmentationId);
    });
}

export function getSegmentationIds() {
    return csToolsSegmentation.state
        .getSegmentations()
        .map(x => x.segmentationId);
}

export function handleFileSelect(evt, state) {
    evt.stopPropagation();
    evt.preventDefault();

    const files = evt.dataTransfer.files;
    readDicom(files, state);
}

export function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "copy";
}
