import { api } from "dicomweb-client";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneAdapters from "@cornerstonejs/adapters";

import { dicomMap } from "./demo";

import {
    addBrushSizeSlider,
    addButtonToToolbar,
    addDropdownToToolbar,
    addLabelToToolbar,
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
    eventTarget,
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
    segmentation: csToolsSegmentation,
    utilities: csToolsUtilities
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
const viewportIds = ["CT_AXIAL", "CT_SAGITTAL", "CT_CORONAL"];
let imageIds: string[] = [];
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

const group4 = document.createElement("div");
group4.style.marginBottom = "10px";
demoToolbar.appendChild(group4);

const group5 = document.createElement("div");
group5.style.marginBottom = "10px";
demoToolbar.appendChild(group5);

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

createInfoSection(content)
    .addInstruction('You can try configuring "dev" in the console:')
    .openNestedSection()
    .addInstruction("fetchDicom")
    .addInstruction("fetchSegmentation")
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

async function fetchDicom() {
    // Get Cornerstone imageIds for the source data and fetch metadata into RAM
    imageIds = await createImageIdsAndCacheMetaData(dev.getConfig.fetchDicom);

    //
    await loadDicom(imageIds.reverse());
}

async function readDicom(files: FileList) {
    if (files.length <= 1) {
        console.error(
            "Viewport volume does not support just one image, it must be two or more images"
        );
        return;
    }

    imageIds = [];

    for (const file of files) {
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
    const newSegmentationId = "MY_SEG_ID:" + csUtilities.uuidv4();
    // Add some segmentations based on the source data volume
    await addSegmentationsToState(newSegmentationId);
    // Update the dropdown
    updateSegmentationDropdown();

    //
    toolGroup.addViewport(viewportIds[0], renderingEngineId);
    toolGroup.addViewport(viewportIds[1], renderingEngineId);
    toolGroup.addViewport(viewportIds[2], renderingEngineId);

    // Set the volume to load
    volume.load();
    // Set volumes on the viewports
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

    // Render the image
    renderingEngine.renderViewports(viewportIds);
}

async function fetchSegmentation() {
    if (!volumeId) {
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
}

async function importSegmentation(files: FileList) {
    if (!volumeId) {
        return;
    }

    for (const file of files) {
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
    // Generate segmentation id
    const newSegmentationId = "LOAD_SEG_ID:" + csUtilities.uuidv4();

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
    // Todo: need to move to the new model with voxel manager
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
            viewportIds[0]
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
        const color = csToolsSegmentation.config.color.getSegmentIndexColor(
            activeSegmentationRepresentation.segmentationRepresentationUID,
            segmentIndex
        );

        const segmentMetadata = generateMockMetadata(segmentIndex, color);
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

async function addActiveSegmentation() {
    if (!volumeId) {
        return;
    }

    // Generate segmentation id
    const newSegmentationId = "NEW_SEG_ID:" + csUtilities.uuidv4();
    // Add some segmentations based on the source data stack
    await addSegmentationsToState(newSegmentationId);
    // Update the dropdown
    updateSegmentationDropdown(newSegmentationId);
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
    csToolsSegmentation.removeSegmentationRepresentations(toolGroupId, [
        segmentationRepresentationUID
    ]);

    //
    csToolsSegmentation.state.removeSegmentation(segmentationId);
    //
    cache.removeVolumeLoadObject(segmentationId);

    // Update the dropdown
    updateSegmentationDropdown();
}

function plusActiveSegment() {
    if (!volumeId) {
        return;
    }

    // Get active segmentation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            toolGroupId
        );
    //
    if (!activeSegmentation) {
        return;
    }

    if (activeSegmentation.activeSegmentIndex + 1 <= 255) {
        csToolsSegmentation.segmentIndex.setActiveSegmentIndex(
            activeSegmentation.segmentationId,
            activeSegmentation.activeSegmentIndex + 1
        );

        // Update the dropdown
        updateSegmentDropdown();
    }
}

function minusActiveSegment() {
    if (!volumeId) {
        return;
    }

    // Get active segmentation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            toolGroupId
        );
    //
    if (!activeSegmentation) {
        return;
    }

    if (activeSegmentation.activeSegmentIndex - 1 >= 1) {
        csToolsSegmentation.segmentIndex.setActiveSegmentIndex(
            activeSegmentation.segmentationId,
            activeSegmentation.activeSegmentIndex - 1
        );

        // Update the dropdown
        updateSegmentDropdown();
    }
}

function removeActiveSegment() {
    if (!volumeId) {
        return;
    }

    // Get active segmentation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            toolGroupId
        );
    //
    if (!activeSegmentation) {
        return;
    }

    // Get volume
    const volume = cache.getVolume(activeSegmentation.segmentationId);

    // Get scalar data
    // Todo: need to move to the new model with voxel manager
    const scalarData = volume.getScalarData();

    //
    const frameLength = volume.dimensions[0] * volume.dimensions[1];
    const numFrames = volume.dimensions[2];

    //
    let index = 0;

    //
    const modifiedFrames = new Set<number>();

    //
    for (let f = 0; f < numFrames; f++) {
        //
        for (let p = 0; p < frameLength; p++) {
            if (scalarData[index] === activeSegmentation.activeSegmentIndex) {
                scalarData[index] = 0;

                modifiedFrames.add(f);
            }

            index++;
        }
    }

    //
    const modifiedFramesArray = Array.from(modifiedFrames);

    // Event trigger (SEGMENTATION_DATA_MODIFIED)
    csToolsSegmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
        activeSegmentation.segmentationId,
        modifiedFramesArray
    );

    // Update the dropdown
    updateSegmentDropdown();
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
    onClick: fetchDicom,
    container: group1
});

addButtonToToolbar({
    id: "LOAD_SEGMENTATION",
    title: "Load SEG",
    style: {
        marginRight: "5px"
    },
    onClick: fetchSegmentation,
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
    onChange: importSegmentation,
    container: group2
});

addButtonToToolbar({
    id: "EXPORT_SEGMENTATION",
    title: "Export SEG",
    onClick: exportSegmentation,
    container: group2
});

addDropdownToToolbar({
    id: "LABELMAP_TOOLS_DROPDOWN",
    style: {
        width: "150px",
        marginRight: "10px"
    },
    options: { map: labelmapTools.toolMap, defaultIndex: 0 },
    onSelectedValueChange: nameAsStringOrNumber => {
        const tool = String(nameAsStringOrNumber);

        const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

        if (!toolGroup) {
            return;
        }

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
    container: group3
});

addBrushSizeSlider({
    toolGroupId: toolGroupId,
    container: group3
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
            csToolsSegmentation.state.getSegmentationRepresentationsForSegmentation(
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
    container: group4
});

addButtonToToolbar({
    id: "ADD_ACTIVE_SEGMENTATION",
    style: {
        marginRight: "10px"
    },
    title: "Add Active Segmentation",
    onClick: addActiveSegmentation,
    container: group4
});

addButtonToToolbar({
    id: "REMOVE_ACTIVE_SEGMENTATION",
    title: "Remove Active Segmentation",
    onClick: removeActiveSegmentation,
    container: group4
});

addLabelToToolbar({
    id: "CURRENT_ACTIVE_SEGMENT_LABEL",
    title: "Current Active Segment: 1",
    style: {
        marginRight: "10px"
    },
    container: group5
});

addButtonToToolbar({
    id: "PLUS_ACTIVE_SEGMENT",
    attr: {
        title: "Plus Active Segment"
    },
    style: {
        marginRight: "10px"
    },
    title: "+",
    onClick: plusActiveSegment,
    container: group5
});

addButtonToToolbar({
    id: "MINUS_ACTIVE_SEGMENT",
    attr: {
        title: "Minus Active Segment"
    },
    style: {
        marginRight: "10px"
    },
    title: "-",
    onClick: minusActiveSegment,
    container: group5
});

addDropdownToToolbar({
    id: "ACTIVE_SEGMENT_DROPDOWN",
    style: {
        width: "200px",
        marginRight: "10px"
    },
    options: { values: [], defaultValue: "" },
    placeholder: "No active segment...",
    onSelectedValueChange: nameAsStringOrNumber => {
        const segmentIndex = Number(nameAsStringOrNumber);

        // Get active segmentation
        const activeSegmentation =
            csToolsSegmentation.activeSegmentation.getActiveSegmentation(
                toolGroupId
            );

        csToolsSegmentation.segmentIndex.setActiveSegmentIndex(
            activeSegmentation.segmentationId,
            segmentIndex
        );

        // Update the dropdown
        updateSegmentDropdown();
    },
    labelText: "Set Active Segment: ",
    container: group5
});

addButtonToToolbar({
    id: "REMOVE_ACTIVE_SEGMENT",
    title: "Remove Active Segment",
    onClick: removeActiveSegment,
    container: group5
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
    csToolsSegmentation.removeSegmentationRepresentations(toolGroupId);

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

    // Add the segmentation representation to the viewport
    await csToolsSegmentation.addSegmentationRepresentations(viewportIds[0], [
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

    //
    if (segmentationIds.length) {
        segmentationIds.forEach((segmentationId: string) => {
            const option = document.createElement("option");
            option.value = segmentationId;
            option.innerText = segmentationId;
            dropdown.appendChild(option);
        });

        if (activeSegmentationId) {
            dropdown.value = activeSegmentationId;
        }
    }
    //
    else {
        const option = document.createElement("option");
        option.setAttribute("disabled", "");
        option.setAttribute("hidden", "");
        option.setAttribute("selected", "");
        option.innerText = "No active segmentation...";
        dropdown.appendChild(option);
    }

    //
    updateSegmentDropdown();
}

function updateSegmentDropdown() {
    const dropdown = document.getElementById(
        "ACTIVE_SEGMENT_DROPDOWN"
    ) as HTMLSelectElement;

    dropdown.innerHTML = "";

    // Get active segmentation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            toolGroupId
        );

    //
    if (!activeSegmentation) {
        const option = document.createElement("option");
        option.setAttribute("disabled", "");
        option.setAttribute("hidden", "");
        option.setAttribute("selected", "");
        option.innerText = "No active segment...";
        dropdown.appendChild(option);

        return;
    }

    //
    const activeSegmentIndex = activeSegmentation.activeSegmentIndex;

    const segmentIndices =
        csToolsUtilities.segmentation.getUniqueSegmentIndices(
            activeSegmentation.segmentationId
        );

    //
    const optionDraw = function () {
        const option = document.createElement("option");
        option.setAttribute("disabled", "");
        option.setAttribute("hidden", "");
        option.setAttribute("selected", "");
        option.innerText = "Draw or set segment index";
        dropdown.appendChild(option);
    };

    //
    if (segmentIndices.length) {
        if (!segmentIndices.includes(activeSegmentIndex)) {
            optionDraw();
        }

        segmentIndices.forEach((segmentIndex: number) => {
            const option = document.createElement("option");
            option.value = segmentIndex.toString();
            option.innerText = segmentIndex.toString();
            dropdown.appendChild(option);
        });

        if (segmentIndices.includes(activeSegmentIndex)) {
            dropdown.value = activeSegmentIndex.toString();
        }
    }
    //
    else {
        optionDraw();
    }

    //
    updateSegmentLabel();
}

function updateSegmentLabel() {
    const label = document.getElementById(
        "CURRENT_ACTIVE_SEGMENT_LABEL"
    ) as HTMLSelectElement;

    // Get active segmentation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            toolGroupId
        );

    label.innerHTML =
        "Current Active Segment: " + activeSegmentation.activeSegmentIndex;
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

    //
    eventTarget.addEventListener(
        csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
        function () {
            updateSegmentDropdown();
        }
    );
}

run();
