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
    utilities: csUtilities
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
const viewportIds = ["CT_STACK"];
let imageIds: string[] = [];

// ======== Set up page ======== //

setTitleAndDescription(
    "DICOM SEG STACK",
    "Here we demonstrate how to import or export a DICOM SEG from a Cornerstone3D stack."
);

// TODO
const descriptionContainer = document.getElementById(
    "demo-description-container"
);

const warn = document.createElement("div");
descriptionContainer.prepend(warn);

const textA = document.createElement("p");
textA.style.color = "red";
textA.innerHTML =
    "<b>Warning:</b><br>Load or import into dicom or segmentation, just one frame. Several frames are not yet completed.<br>When exporting segmentation, also just one frame.";
warn.appendChild(textA);
// END TODO

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

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = e => e.preventDefault();

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

createInfoSection(content)
    .addInstruction('You can try configuring "dev" in the console:')
    .openNestedSection()
    .addInstruction("fetchDicom")
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
    restart();

    // Get Cornerstone imageIds for the source data and fetch metadata into RAM
    imageIds = await createImageIdsAndCacheMetaData(dev.getConfig.fetchDicom);

    // TODO
    if (
        dev.getConfig.fetchDicom.StudyInstanceUID ===
        "1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046"
    ) {
        imageIds = imageIds.slice(50, 51);
    }

    //
    imageIds = imageIds.slice(0, 1);

    await loadDicom(imageIds);
}

async function readDicom(files: FileList) {
    restart();

    // TODO
    const arr = [files[0]];

    imageIds = [];

    for (const file of arr) {
        const imageId = wadouri.fileManager.add(file);

        await imageLoader.loadAndCacheImage(imageId);

        imageIds.push(imageId);
    }

    await loadDicom(imageIds);
}

async function loadDicom(imageIds: string[]) {
    //
    toolGroup.addViewport(viewportIds[0], renderingEngineId);

    //
    const viewport = renderingEngine.getViewport(viewportIds[0]);
    //
    await viewport.setStack(imageIds, 0);

    // Generate segmentation id
    const newSegmentationId = "NEW_SEG_ID:" + csUtilities.uuidv4();
    // Add some segmentations based on the source data stack
    await addSegmentationsToState(newSegmentationId);
    // Update the dropdown
    updateSegmentationDropdown();

    // Render the image
    renderingEngine.renderViewports(viewportIds);
}

async function fetchSegmentation() {
    if (!imageIds.length) {
        return;
    }

    const configSeg = dev.getConfig.fetchSegmentation;

    // @ts-expect-error
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
    if (!imageIds.length) {
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

    // Add some segmentations based on the source data stack
    const derivedImages = await addSegmentationsToState(newSegmentationId);
    // Update the dropdown
    updateSegmentationDropdown(newSegmentationId);

    //
    const generateToolState =
        await Cornerstone3D.Segmentation.generateToolState(
            imageIds,
            arrayBuffer,
            metaData
        );

    //
    derivedImages.forEach(image => {
        const cachedImage = cache.getImage(image.imageId);

        if (cachedImage) {
            const pixelData = cachedImage.getPixelData();

            //
            pixelData.set(
                new Uint8Array(generateToolState.labelmapBufferArray[0])
            );
        }
    });

    // TODO
    setTimeout(function () {
        //
        csToolsSegmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
            newSegmentationId
        );
    }, 200);
}

function exportSegmentation() {
    //
    const segmentationIds = getSegmentationIds();
    //
    if (!segmentationIds.length) {
        return;
    }

    // Get active segmentation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            toolGroupId
        );
    // Get active segmentation representation
    const activeSegmentationRepresentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentationRepresentation(
            toolGroupId
        );

    if (!activeSegmentation || !activeSegmentationRepresentation) {
        return;
    }

    //
    const labelmap = activeSegmentation.representationData[
        csToolsEnums.SegmentationRepresentations.Labelmap
    ] as cornerstoneTools.Types.LabelmapToolOperationDataStack;

    //
    if (labelmap.imageIdReferenceMap) {
        //
        labelmap.imageIdReferenceMap.forEach(
            async (derivedImagesId: string, imageId: string) => {
                //
                await imageLoader.loadAndCacheImage(imageId);
                //
                const cacheImage = cache.getImage(imageId);

                //
                const cacheSegmentationImage = cache.getImage(derivedImagesId);

                // TODO
                // generateLabelMaps2DFrom3D required "scalarData" and "dimensions"
                cacheSegmentationImage.scalarData =
                    cacheSegmentationImage.getPixelData();
                cacheSegmentationImage.dimensions = [
                    cacheSegmentationImage.columns,
                    cacheSegmentationImage.rows,
                    1
                ];

                //
                const labelmapData =
                    Cornerstone3D.Segmentation.generateLabelMaps2DFrom3D(
                        cacheSegmentationImage
                    );

                // Generate fake metadata as an example
                labelmapData.metadata = [];
                labelmapData.segmentsOnLabelmap.forEach(
                    (segmentIndex: number) => {
                        const color =
                            csToolsSegmentation.config.color.getColorForSegmentIndex(
                                toolGroupId,
                                activeSegmentationRepresentation.segmentationRepresentationUID,
                                segmentIndex
                            );

                        const segmentMetadata = generateMockMetadata(
                            segmentIndex,
                            color
                        );
                        labelmapData.metadata[segmentIndex] = segmentMetadata;
                    }
                );

                // TODO
                // https://github.com/cornerstonejs/cornerstone3D/issues/1059#issuecomment-2181016046
                const generatedSegmentation =
                    Cornerstone3D.Segmentation.generateSegmentation(
                        [cacheImage, cacheImage],
                        labelmapData,
                        metaData
                    );

                downloadDICOMData(generatedSegmentation.dataset, "mySEG.dcm");
            }
        );
    }
}

async function addActiveSegmentation() {
    if (!imageIds.length) {
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
    if (!segmentationIds.length) {
        return;
    }

    // Get active segmentation
    const activeSegmentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            toolGroupId
        );
    // Get active segmentation representation
    const activeSegmentationRepresentation =
        csToolsSegmentation.activeSegmentation.getActiveSegmentationRepresentation(
            toolGroupId
        );

    if (!activeSegmentation || !activeSegmentationRepresentation) {
        return;
    }

    //
    csToolsSegmentation.removeSegmentationRepresentations(viewportIds[0], [
        activeSegmentationRepresentation.segmentationRepresentationUID
    ]);

    //
    csToolsSegmentation.state.removeSegmentation(
        activeSegmentation.segmentationId
    );

    //
    const labelmap = activeSegmentation.representationData[
        csToolsEnums.SegmentationRepresentations.Labelmap
    ] as cornerstoneTools.Types.LabelmapToolOperationDataStack;

    //
    if (labelmap.imageIds) {
        //
        labelmap.imageIds.forEach((derivedImagesId: string) => {
            //
            cache.removeImageLoadObject(derivedImagesId);
        });
    }

    // Update the dropdown
    updateSegmentationDropdown();
}

function plusActiveSegment() {
    if (!imageIds.length) {
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
    if (!imageIds.length) {
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
    if (!imageIds.length) {
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

    //
    const labelmap = activeSegmentation.representationData[
        csToolsEnums.SegmentationRepresentations.Labelmap
    ] as cornerstoneTools.Types.LabelmapToolOperationDataStack;

    //
    const modifiedFrames = new Set<number>();

    //
    if (labelmap.imageIds) {
        //
        labelmap.imageIds.forEach((derivedImagesId: string) => {
            // Get image
            const image = cache.getImage(derivedImagesId);

            // Get pixel data
            const pixelData = image.getPixelData();

            //
            const frameLength = image.columns * image.rows;
            const numFrames = 1;

            //
            let index = 0;

            //
            for (let f = 0; f < numFrames; f++) {
                //
                for (let p = 0; p < frameLength; p++) {
                    if (
                        pixelData[index] ===
                        activeSegmentation.activeSegmentIndex
                    ) {
                        pixelData[index] = 0;

                        modifiedFrames.add(f);
                    }

                    index++;
                }
            }
        });
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

// TODO
const inputConfig = {
    attr: {
        multiple: false
    }
};

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
    container: group2,
    input: inputConfig
});

addUploadToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    style: {
        marginRight: "5px"
    },
    onChange: importSegmentation,
    container: group2,
    input: inputConfig
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
    options: { map: labelmapTools.toolMap },
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

// If you import the dicom again, before clearing the cache or starting from scratch
function restart() {
    if (!imageIds.length) {
        return;
    }

    //
    imageIds.forEach(imageId => {
        if (cache.getImage(imageId)) {
            cache.removeImageLoadObject(imageId);
        }
    });

    //
    csToolsSegmentation.removeSegmentationRepresentations(viewportIds[0]);

    //
    const segmentations = csToolsSegmentation.state.getSegmentations();
    //
    segmentations.forEach(segmentation => {
        csToolsSegmentation.state.removeSegmentation(
            segmentation.segmentationId
        );

        //
        const labelmap = segmentation.representationData[
            csToolsEnums.SegmentationRepresentations.Labelmap
        ] as cornerstoneTools.Types.LabelmapToolOperationDataStack;

        //
        if (labelmap.imageIds) {
            //
            labelmap.imageIds.forEach(derivedImagesId => {
                cache.removeImageLoadObject(derivedImagesId);
            });
        }
    });
}

function getSegmentationIds(): string[] {
    return csToolsSegmentation.state
        .getSegmentations()
        .map(x => x.segmentationId);
}

async function addSegmentationsToState(segmentationId: string) {
    //
    const derivedImages =
        imageLoader.createAndCacheDerivedSegmentationImages(imageIds);

    // Add the segmentations to state
    csToolsSegmentation.addSegmentations([
        {
            segmentationId,
            representation: {
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
                data: {
                    imageIds: derivedImages.map(x => x.imageId)
                }
            }
        }
    ]);

    // Add the segmentation representation to the toolgroup
    await csToolsSegmentation.addSegmentationRepresentations(viewportIds[0], [
        {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap
        }
    ]);

    //
    return derivedImages;
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

function updateSegmentationDropdown(activeSegmentationId?: string) {
    const dropdown = document.getElementById(
        "ACTIVE_SEGMENTATION_DROPDOWN"
    ) as HTMLSelectElement;

    dropdown.innerHTML = "";

    // Get segmentationIds
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
            type: ViewportType.STACK,
            element: element1,
            defaultOptions: {
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
