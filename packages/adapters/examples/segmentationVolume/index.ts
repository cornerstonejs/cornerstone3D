import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneAdapters from "@cornerstonejs/adapters";

import {
    addBrushSizeSlider,
    addButtonToToolbar,
    addDropdownToToolbar,
    addManipulationBindings,
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
    SegmentationDisplayTool,
    ToolGroupManager,
    segmentation: csToolsSegmentation
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

const { wadouri } = cornerstoneDicomImageLoader;

const { adaptersSEG, helpers } = cornerstoneAdapters;
const { Cornerstone3D } = adaptersSEG;
const { downloadDICOMData } = helpers;

//
let renderingEngine;
const renderingEngineId = "MY_RENDERING_ENGINE_ID";
let toolGroup;
const toolGroupId = "MY_TOOL_GROUP_ID";
const viewportIds = ["CT_ACQUISITION", "CT_AXIAL", "CT_SAGITTAL", "CT_CORONAL"];
let imageIds = [];
const volumeLoaderScheme = "cornerstoneStreamingImageVolume";
let volumeId;

// ======== Set up page ======== //

setTitleAndDescription(
    "DICOM SEG VOLUME",
    "Here we demonstrate how to import or export a DICOM SEG from a Cornerstone3D volume."
);

const size = "500px";

const demoToolbar = document.getElementById("demo-toolbar");

const group1 = document.createElement("div");
group1.style.marginBottom = "10px";
demoToolbar.appendChild(group1);

const group2 = document.createElement("div");
group2.style.marginBottom = "10px";
demoToolbar.appendChild(group2);

const group3 = document.createElement("div");
group3.style.marginBottom = "10px";
demoToolbar.appendChild(group3);

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
const element4 = document.createElement("div");
element4.style.width = size;
element4.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = e => e.preventDefault();
element2.oncontextmenu = e => e.preventDefault();
element3.oncontextmenu = e => e.preventDefault();
element4.oncontextmenu = e => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);
viewportGrid.appendChild(element4);

content.appendChild(viewportGrid);

createInfoSection(content).addInstruction(
    "Viewports: Acquisition | Axial | Sagittal | Coronal"
);

// ============================= //

async function demoDicom() {
    // Get Cornerstone imageIds for the source data and fetch metadata into RAM
    imageIds = await createImageIdsAndCacheMetaData({
        StudyInstanceUID:
            "1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463",
        SeriesInstanceUID:
            "1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561",
        wadoRsRoot: "https://d3t6nz73ql33tx.cloudfront.net/dicomweb"
    });

    await loadDicom(imageIds);
}

async function readDicom(files: FileList) {
    if (files.length <= 1) {
        console.error(
            "Viewport volume does not support just one image, it must be two or more images"
        );
        return;
    }

    imageIds = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const imageId = wadouri.fileManager.add(file);

        await imageLoader.loadAndCacheImage(imageId);

        imageIds.push(imageId);
    }

    await loadDicom(imageIds);
}

async function loadDicom(imageIds: string[]) {
    restart();

    // Generate volume id
    volumeId = volumeLoaderScheme + ":" + csUtilities.uuidv4();

    // Define a volume in memory
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds
    });

    // Generate segmentation id
    const newSegmentationId = "MY_SEGMENTATION_ID:" + csUtilities.uuidv4();
    // Add some segmentations based on the source data volume
    await addSegmentationsToState(newSegmentationId);
    //
    updateSegmentationDropdown();

    //
    toolGroup.addViewport(viewportIds[0], renderingEngineId);
    toolGroup.addViewport(viewportIds[1], renderingEngineId);
    toolGroup.addViewport(viewportIds[2], renderingEngineId);
    toolGroup.addViewport(viewportIds[3], renderingEngineId);

    // Set the volume to load
    volume.load();
    // Set volumes on the viewports
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

    // Render the image
    renderingEngine.renderViewports(viewportIds);
}

async function importSegmentation(files: FileList) {
    if (!volumeId) {
        return;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        await readSegmentation(file);
    }
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
    //
    const newSegmentationId = "LOAD_SEGMENTATION_ID:" + csUtilities.uuidv4();

    //
    const generateToolState =
        await Cornerstone3D.Segmentation.generateToolState(
            imageIds,
            arrayBuffer,
            metaData
        );

    //
    const derivedVolume = await addSegmentationsToState(newSegmentationId);
    //
    const derivedVolumeScalarData = derivedVolume.getScalarData();
    //
    derivedVolumeScalarData.set(
        new Uint8Array(generateToolState.labelmapBufferArray[0])
    );

    // Update the dropdown
    updateSegmentationDropdown(newSegmentationId);
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
    const activeSegmentationRepresentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentationRepresentation(
            toolGroupId
        );

    const cacheSegmentationVolume = cache.getVolume(
        activeSegmentationRepresentation.segmentationId
    );

    //
    const labelmapData = Cornerstone3D.Segmentation.generateLabelMaps2DFrom3D(
        cacheSegmentationVolume
    );

    // Generate fake metadata as an example
    labelmapData.metadata = [];
    labelmapData.segmentsOnLabelmap.forEach(segmentIndex => {
        const color = csToolsSegmentation.config.color.getColorForSegmentIndex(
            toolGroupId,
            activeSegmentationRepresentation.segmentationRepresentationUID,
            segmentIndex
        );

        const segmentMetadata = generateMockMetadata(segmentIndex, color);
        labelmapData.metadata[segmentIndex] = segmentMetadata;
    });

    const generatedSegmentation =
        Cornerstone3D.Segmentation.generateSegmentation(
            csImages,
            labelmapData,
            metaData
        );

    downloadDICOMData(generatedSegmentation.dataset, "mySEG.dcm");
}

function removeActiveSegmentation() {
    //
    const segmentationIds = getSegmentationIds();
    //
    if (segmentationIds.length <= 1) {
        return;
    }

    // Get active segmentation representation
    const { segmentationId, segmentationRepresentationUID } =
        csToolsSegmentation.activeSegmentation.getActiveSegmentationRepresentation(
            toolGroupId
        );

    //
    csToolsSegmentation.removeSegmentationsFromToolGroup(toolGroupId, [
        segmentationRepresentationUID
    ]);

    //
    csToolsSegmentation.state.removeSegmentation(segmentationId);
    //
    cache.removeVolumeLoadObject(segmentationId);

    // Update the dropdown
    updateSegmentationDropdown();
}

// ============================= //

addButtonToToolbar({
    id: "DEMO_DICOM",
    title: "Demo DICOM",
    style: {
        marginRight: "5px"
    },
    onClick: demoDicom,
    container: group1
});

addUploadToToolbar({
    id: "IMPORT_DICOM",
    title: "Import DICOM",
    style: {
        marginRight: "5px"
    },
    onChange: readDicom,
    container: group1
});

addUploadToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    style: {
        marginRight: "5px"
    },
    onChange: importSegmentation,
    container: group1
});

addButtonToToolbar({
    id: "EXPORT_SEGMENTATION",
    title: "Export SEG",
    onClick: exportSegmentation,
    container: group1
});

addDropdownToToolbar({
    id: "LABELMAP_TOOLS_DROPDOWN",
    style: {
        width: "150px",
        marginRight: "10px"
    },
    options: { map: labelmapTools.toolMap },
    onSelectedValueChange: nameAsStringOrNumber => {
        const tool = String(nameAsStringOrNumber);
        const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

        // Set the currently active tool disabled
        const toolName = toolGroup.getActivePrimaryMouseButtonTool();

        if (toolName) {
            toolGroup.setToolDisabled(toolName);
        }

        toolGroup.setToolActive(tool, {
            bindings: [{ mouseButton: MouseBindings.Primary }]
        });
    },
    labelText: "Tools: ",
    container: group2
});

addBrushSizeSlider({
    toolGroupId: toolGroupId,
    container: group2
});

addDropdownToToolbar({
    id: "ACTIVE_SEGMENTATION_DROPDOWN",
    style: {
        width: "200px",
        marginRight: "10px"
    },
    options: { values: [], defaultValue: "" },
    placeholder: "No active segmentation...",
    onSelectedValueChange: nameAsStringOrNumber => {
        const segmentationId = String(nameAsStringOrNumber);

        const segmentationRepresentations =
            csToolsSegmentation.state.getSegmentationIdRepresentations(
                segmentationId
            );

        csToolsSegmentation.activeSegmentation.setActiveSegmentationRepresentation(
            toolGroupId,
            segmentationRepresentations[0].segmentationRepresentationUID
        );

        // Update the dropdown
        updateSegmentationDropdown(segmentationId);
    },
    labelText: "Set Active Segmentation: ",
    container: group3
});

addButtonToToolbar({
    id: "REMOVE_ACTIVE_SEGMENTATION",
    title: "Remove Active Segmentation",
    onClick: removeActiveSegmentation,
    container: group3
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
    csToolsSegmentation.removeSegmentationsFromToolGroup(toolGroupId);

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

async function addSegmentationsToState(segmentationId: string) {
    // Create a segmentation of the same resolution as the source data
    const derivedVolume =
        await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId, {
            volumeId: segmentationId
        });

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
                    volumeId: segmentationId
                }
            }
        }
    ]);

    // Add the segmentation representation to the toolgroup
    await csToolsSegmentation.addSegmentationRepresentations(toolGroupId, [
        {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap
        }
    ]);

    //
    return derivedVolume;
}

function generateMockMetadata(segmentIndex, color) {
    const RecommendedDisplayCIELabValue = dcmjs.data.Colors.rgb2DICOMLAB(
        color.slice(0, 3).map(value => value / 255)
    ).map(value => Math.round(value));

    return {
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
}

function updateSegmentationDropdown(activeSegmentationId?) {
    const dropdown = document.getElementById(
        "ACTIVE_SEGMENTATION_DROPDOWN"
    ) as HTMLSelectElement;

    dropdown.innerHTML = "";

    const segmentationIds = getSegmentationIds();

    segmentationIds.forEach(segmentationId => {
        const option = document.createElement("option");
        option.value = segmentationId;
        option.innerText = segmentationId;
        dropdown.appendChild(option);
    });

    if (activeSegmentationId) {
        dropdown.value = activeSegmentationId;
    }
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

    //
    labelmapTools.toolMap.forEach(x => {
        if (x.configuration?.preview) {
            x.configuration.preview.enabled = false;
        }
    });

    // Define tool groups to add the segmentation display tool to
    toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
    addManipulationBindings(toolGroup, { toolMap: labelmapTools.toolMap });
    //
    cornerstoneTools.addTool(SegmentationDisplayTool);
    toolGroup.addTool(SegmentationDisplayTool.toolName);

    // Instantiate a rendering engine
    renderingEngine = new RenderingEngine(renderingEngineId);

    // Create the viewports
    const viewportInputArray = [
        {
            viewportId: viewportIds[0],
            type: ViewportType.ORTHOGRAPHIC,
            element: element1,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.ACQUISITION,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportIds[1],
            type: ViewportType.ORTHOGRAPHIC,
            element: element2,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.AXIAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportIds[2],
            type: ViewportType.ORTHOGRAPHIC,
            element: element3,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.SAGITTAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportIds[3],
            type: ViewportType.ORTHOGRAPHIC,
            element: element4,
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
