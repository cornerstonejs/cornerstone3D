import { api } from "dicomweb-client";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneAdapters from "@cornerstonejs/adapters";

import { dicomMap } from "./demo";

import {
    addButtonToToolbar,
    addDropdownToToolbar,
    addManipulationBindings,
    addToggleButtonToToolbar,
    addUploadToToolbar,
    createImageIdsAndCacheMetaData,
    createInfoSection,
    initDemo,
    labelmapTools,
    setTitleAndDescription
} from "../../../../utils/demo/helpers";

import dcmjs from "dcmjs";

// This is for debugging purposes
console.warn(
    "Click on index.ts to open source code for this example --------->"
);

const {
    Enums: csEnums,
    RenderingEngine,
    cache,
    imageLoader,
    metaData,
    setVolumesForViewports,
    utilities: csUtilities,
    volumeLoader
} = cornerstone;
const { ViewportType } = csEnums;

const {
    Enums: csToolsEnums,
    ToolGroupManager,
    segmentation: csToolsSegmentation
} = cornerstoneTools;

const { wadouri } = cornerstoneDicomImageLoader;

const { adaptersSEG, helpers } = cornerstoneAdapters;
const { Cornerstone3D } = adaptersSEG;
const { downloadDICOMData } = helpers;

//
let renderingEngine;
const renderingEngineId = "MY_RENDERING_ENGINE_ID";
let toolGroup;
const toolGroupId = "MY_TOOL_GROUP_ID";
const viewportIds = ["CT_AXIAL", "CT_SAGITTAL", "CT_CORONAL"];
const volumeLoaderScheme = "cornerstoneStreamingImageVolume";
let volumeId;
const segmentationId = "LOAD_SEG_ID:" + csUtilities.uuidv4();

let referenceImageIds: string[] = [];
const segImageIds: string[] = [];
// ======== Set up page ======== //

setTitleAndDescription(
    "DICOM SEG VOLUME",
    "Here we demonstrate how to import or export a DICOM SEG from a Cornerstone3D volume."
);

const size = "500px";
let skipOverlapping = false;

const demoToolbar = document.getElementById("demo-toolbar");

const group1 = document.createElement("div");
group1.style.marginBottom = "10px";
demoToolbar.appendChild(group1);

const group2 = document.createElement("div");
group2.style.marginBottom = "10px";
demoToolbar.appendChild(group2);

const content = document.getElementById("content");

const viewportGrid = document.createElement("div");
viewportGrid.style.display = "flex";
viewportGrid.style.flexDirection = "row";

viewportGrid.addEventListener("dragover", handleDragOver, false);
viewportGrid.addEventListener("drop", handleFileSelect, false);

const element1 = document.createElement("div");
element1.style.width = size;
element1.style.height = size;
const element2 = document.createElement("div");
element2.style.width = size;
element2.style.height = size;
const element3 = document.createElement("div");
element3.style.width = size;
element3.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = e => e.preventDefault();
element2.oncontextmenu = e => e.preventDefault();
element3.oncontextmenu = e => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

createInfoSection(content)
    .addInstruction("Viewports:")
    .openNestedSection()
    .addInstruction("Axial | Sagittal | Coronal")
    .closeNestedSection();

// ============================= //

let devConfig = {
    ...dicomMap.values().next().value
};
const dev = {
    get getConfig() {
        return devConfig;
    },
    set setConfig(obj: object) {
        devConfig = csUtilities.deepMerge(devConfig, obj);
    }
};
(window as any).dev = dev;

// ============================= //

async function readDicom(files: FileList) {
    if (files.length <= 1) {
        console.error(
            "Viewport volume does not support just one image, it must be two or more images"
        );
        return;
    }

    for (const file of files) {
        const imageId = wadouri.fileManager.add(file);
        await imageLoader.loadAndCacheImage(imageId);

        referenceImageIds.push(imageId);
    }

    await loadDicom(referenceImageIds);
}

async function loadDicom(imageIds: string[]) {
    restart();

    // Generate volume id
    volumeId = volumeLoaderScheme + ":" + csUtilities.uuidv4();

    // Define a volume in memory
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds
    });

    //
    toolGroup.addViewport(viewportIds[0], renderingEngineId);
    toolGroup.addViewport(viewportIds[1], renderingEngineId);
    toolGroup.addViewport(viewportIds[2], renderingEngineId);

    // Set the volume to load
    await volume.load();
    // Set volumes on the viewports
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

    // Render the image
    renderingEngine.render();
}

async function readSegmentation(file: File) {
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

    loadSegmentation(arrayBuffer);
}

async function loadSegmentation(arrayBuffer: ArrayBuffer) {
    const generateToolState =
        await Cornerstone3D.Segmentation.generateToolState(
            referenceImageIds,
            arrayBuffer,
            metaData,
            {
                skipOverlapping
            }
        );

    if (generateToolState.labelmapBufferArray.length !== 1) {
        alert(
            "Overlapping segments in your segmentation are not supported yet. You can turn on the skipOverlapping option but it will override the overlapping segments."
        );
        return;
    }

    const derivedSegmentationImages =
        await imageLoader.createAndCacheDerivedLabelmapImages(
            referenceImageIds as string[]
        );

    const derivedSegmentationImageIds = derivedSegmentationImages.map(
        image => image.imageId
    );

    //
    // Add the segmentations to state
    csToolsSegmentation.addSegmentations([
        {
            segmentationId,
            representation: {
                // The type of segmentation
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
                // The actual segmentation data, in the case of labelmap this is a
                // reference to the source volume of the segmentation.
                data: {
                    imageIds: derivedSegmentationImageIds
                }
            }
        }
    ]);

    const segMap = {
        [viewportIds[0]]: [{ segmentationId }],
        [viewportIds[1]]: [{ segmentationId }],
        [viewportIds[2]]: [{ segmentationId }]
    };
    // Add the segmentation representation to the viewport
    await csToolsSegmentation.addLabelmapRepresentationToViewportMap(segMap);

    const volumeScalarData = new Uint8Array(
        generateToolState.labelmapBufferArray[0]
    );

    // We should parse the segmentation as separate slices to support overlapping segments.
    // This parsing should occur in the CornerstoneJS library adapters.
    // For now, we use the volume returned from the library and chop it here.
    for (let i = 0; i < derivedSegmentationImages.length; i++) {
        const voxelManager = derivedSegmentationImages[i].voxelManager;
        const scalarData = voxelManager.getScalarData();
        scalarData.set(
            volumeScalarData.slice(
                i * scalarData.length,
                (i + 1) * scalarData.length
            )
        );
        voxelManager.setScalarData(scalarData);
    }
}

async function exportSegmentation() {
    //
    const segmentationIds = getSegmentationIds();
    //
    if (!segmentationIds.length) {
        return;
    }

    // Get cache volume
    const cacheVolume = cache.getVolume(volumeId);
    const csImages = cacheVolume.getCornerstoneImages();

    // Get active segmentation representation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            viewportIds[0]
        );

    const cacheSegmentationVolume = cache.getVolume(
        activeSegmentation.segmentationId
    );

    //
    const labelmapData = Cornerstone3D.Segmentation.generateLabelMaps2DFrom3D(
        cacheSegmentationVolume
    );

    // Generate fake metadata as an example
    labelmapData.metadata = [];
    labelmapData.segmentsOnLabelmap.forEach(segmentIndex => {
        const color = csToolsSegmentation.config.color.getSegmentIndexColor(
            viewportIds[0],
            activeSegmentation.segmentationId,
            segmentIndex
        );

        const RecommendedDisplayCIELabValue = dcmjs.data.Colors.rgb2DICOMLAB(
            color.slice(0, 3).map(value => value / 255)
        ).map(value => Math.round(value));

        const segmentMetadata = {
            SegmentedPropertyCategoryCodeSequence: {
                CodeValue: "T-D0050",
                CodingSchemeDesignator: "SRT",
                CodeMeaning: "Tissue"
            },
            SegmentNumber: segmentIndex.toString(),
            SegmentLabel: "Tissue " + segmentIndex.toString(),
            SegmentAlgorithmType: "SEMIAUTOMATIC",
            SegmentAlgorithmName: "Slicer Prototype",
            RecommendedDisplayCIELabValue,
            SegmentedPropertyTypeCodeSequence: {
                CodeValue: "T-D0050",
                CodingSchemeDesignator: "SRT",
                CodeMeaning: "Tissue"
            }
        };

        labelmapData.metadata[segmentIndex] = segmentMetadata;
    });

    //
    const generatedSegmentation =
        Cornerstone3D.Segmentation.generateSegmentation(
            csImages,
            labelmapData,
            metaData
        );

    downloadDICOMData(generatedSegmentation.dataset, "mySEG.dcm");
}

// ============================= //

addDropdownToToolbar({
    id: "DICOM_DROPDOWN",
    style: {
        marginRight: "10px"
    },
    options: { map: dicomMap, defaultIndex: 0 },
    onSelectedValueChange: (key, value) => {
        dev.setConfig = value;
    },
    container: group1
});

addButtonToToolbar({
    id: "LOAD_DICOM",
    title: "Load DICOM",
    style: {
        marginRight: "5px"
    },
    onClick: async () => {
        // Get Cornerstone imageIds for the source data and fetch metadata into RAM
        referenceImageIds = await createImageIdsAndCacheMetaData(
            dev.getConfig.fetchDicom
        );

        //
        await loadDicom(referenceImageIds);
    },
    container: group1
});

addButtonToToolbar({
    id: "LOAD_SEGMENTATION",
    title: "Load SEG",
    style: {
        marginRight: "5px"
    },
    onClick: async () => {
        if (!volumeId) {
            alert("load source dicom first");
            return;
        }

        const configSeg = dev.getConfig.fetchSegmentation;

        const client = new api.DICOMwebClient({
            url: configSeg.wadoRsRoot
        });
        const arrayBuffer = await client.retrieveInstance({
            studyInstanceUID: configSeg.StudyInstanceUID,
            seriesInstanceUID: configSeg.SeriesInstanceUID,
            sopInstanceUID: configSeg.SOPInstanceUID
        });

        //
        await loadSegmentation(arrayBuffer);
    },
    container: group1
});

addUploadToToolbar({
    id: "IMPORT_DICOM",
    title: "Import DICOM",
    style: {
        marginRight: "5px"
    },
    onChange: readDicom,
    container: group2
});

addUploadToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    style: {
        marginRight: "5px"
    },
    onChange: async (files: FileList) => {
        if (!volumeId) {
            return;
        }

        for (const file of files) {
            await readSegmentation(file);
        }
    },
    container: group2
});

addButtonToToolbar({
    id: "EXPORT_SEGMENTATION",
    title: "Export SEG",
    onClick: exportSegmentation,
    container: group2
});

addToggleButtonToToolbar({
    id: "SKIP_OVERLAPPING",
    title: "Override Overlapping Segments",
    onClick: () => {
        skipOverlapping = !skipOverlapping;
    },
    container: group1
});

// ============================= //

function restart() {
    // If you import the dicom again, before clearing the cache or starting from scratch
    if (!volumeId) {
        return;
    }

    //
    cache.removeVolumeLoadObject(volumeId);

    //
    csToolsSegmentation.removeAllSegmentationRepresentations();

    //
    const segmentationIds = getSegmentationIds();
    //
    segmentationIds.forEach(segmentationId => {
        csToolsSegmentation.state.removeSegmentation(segmentationId);
        cache.removeVolumeLoadObject(segmentationId);
    });
}

function getSegmentationIds() {
    return csToolsSegmentation.state
        .getSegmentations()
        .map(x => x.segmentationId);
}

function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    //
    const files = evt.dataTransfer.files;

    //
    readDicom(files);
}

function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "copy";
}

// ============================= //

/**
 * Runs the demo
 */
async function run() {
    // Init Cornerstone and related libraries
    await initDemo();

    // Define tool groups to add the segmentation display tool to
    toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
    addManipulationBindings(toolGroup, { toolMap: labelmapTools.toolMap });

    // Instantiate a rendering engine
    renderingEngine = new RenderingEngine(renderingEngineId);

    // Create the viewports
    const viewportInputArray = [
        {
            viewportId: viewportIds[0],
            type: ViewportType.ORTHOGRAPHIC,
            element: element1,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.AXIAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportIds[1],
            type: ViewportType.ORTHOGRAPHIC,
            element: element2,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.SAGITTAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportIds[2],
            type: ViewportType.ORTHOGRAPHIC,
            element: element3,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.CORONAL,
                background: [0.2, 0, 0.2]
            }
        }
    ];

    //
    renderingEngine.setViewports(viewportInputArray);
}

run();
