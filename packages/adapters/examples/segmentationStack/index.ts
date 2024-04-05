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
    initDemo,
    labelmapTools,
    setTitleAndDescription
} from "../../../../utils/demo/helpers";

// This is for debugging purposes
console.warn(
    "Click on index.ts to open source code for this example --------->"
);

const {
    Enums: csEnums,
    RenderingEngine,
    cache,
    imageLoader,
    utilities: csUtilities
} = cornerstone;
const { ViewportType } = csEnums;

const {
    Enums: csToolsEnums,
    SegmentationDisplayTool,
    ToolGroupManager,
    segmentation: csToolsSegmentation,
    utilities: csToolsUtilities
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

const { wadouri } = cornerstoneDicomImageLoader;

const { helpers } = cornerstoneAdapters;
const { downloadDICOMData } = helpers;

//
let renderingEngine;
const renderingEngineId = "MY_RENDERING_ENGINE_ID";
let toolGroup;
const toolGroupId = "MY_TOOL_GROUP_ID";
const viewportIds = ["CT_STACK"];
let imageIds = [];

// ======== Set up page ======== //

setTitleAndDescription("DICOM SEG STACK [Construction is underway]", "");

/* setTitleAndDescription(
    "DICOM SEG STACK",
    "Here we demonstrate how to import or export a DICOM SEG from a Cornerstone3D stack."
); */

// TODO
const descriptionContainer = document.getElementById(
    "demo-description-container"
);

const warn = document.createElement("div");
descriptionContainer.prepend(warn);

const textA = document.createElement("p");
textA.style.color = "red";
textA.innerHTML =
    "Notice: The import and export from to stack viewport in DICOM SEG format is not done yet. I did as said ";
warn.appendChild(textA);

const link = document.createElement("a");
link.href =
    "https://github.com/cornerstonejs/cornerstone3D/issues/1059#issuecomment-1954647390";
link.innerHTML = "#1059";
link.target = "_blank";
textA.appendChild(link);

const textB = document.createElement("p");
textB.style.color = "red";
textB.innerHTML =
    "When importing dicom or demo dicom only one image view and not several." +
    "<br>" +
    "When importing seg or exporting seg, it is not dicom seg format, just dicom arraybuffer.";
warn.appendChild(textB);
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

// ============================= //

async function demoDicom() {
    restart();

    // Get Cornerstone imageIds for the source data and fetch metadata into RAM
    const imageIdsArray = await createImageIdsAndCacheMetaData({
        StudyInstanceUID:
            "1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463",
        SeriesInstanceUID:
            "1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561",
        wadoRsRoot: "https://d3t6nz73ql33tx.cloudfront.net/dicomweb"
    });

    imageIds = imageIdsArray.slice(0, 1);

    await loadDicom(imageIds);
}

async function readDicom(files: FileList) {
    restart();

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

async function importSegmentation(files: FileList) {
    if (!imageIds.length) {
        return;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        await readSegmentation(file);
    }
}

async function readSegmentation(file: File) {
    const arrayBuffer = await loadFileRequest(file);
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
    const localImage = imageLoader.createAndCacheLocalImage(
        {
            scalarData: new Uint8Array(arrayBuffer)
        },
        derivedImages.imageIds[0],
        true
    );

    //
    cache._imageCache.forEach(cache => {
        if (cache.imageId == derivedImages.imageIds[0]) {
            cache.image = localImage;
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
    const labelmap =
        activeSegmentation.representationData[
            csToolsEnums.SegmentationRepresentations.Labelmap
        ];

    //
    if (labelmap.imageIdReferenceMap) {
        //
        labelmap.imageIdReferenceMap.forEach((derivedImagesId: string) => {
            /* //
                await imageLoader.loadAndCacheImage(imageId);
                //
                const cacheImage = cache.getImage(imageId); */

            //
            const cacheSegmentationImage = cache.getImage(derivedImagesId);

            const pixelData = cacheSegmentationImage.getPixelData();

            downloadDICOMData(pixelData.buffer, "my_seg_arraybuffer");
        });
    }
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

// TODO
const inputConfig = {
    attr: {
        multiple: false
    }
};

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
    container: group1,
    input: inputConfig
});

addUploadToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    style: {
        marginRight: "5px"
    },
    onChange: importSegmentation,
    container: group1,
    input: inputConfig
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
    csToolsSegmentation.removeSegmentationsFromToolGroup(toolGroupId);

    //
    const segmentations = csToolsSegmentation.state.getSegmentations();
    //
    segmentations.forEach(segmentation => {
        csToolsSegmentation.state.removeSegmentation(
            segmentation.segmentationId
        );

        //
        const labelmap = segmentation.representationData.LABELMAP;

        //
        if (labelmap.imageIdReferenceMap) {
            //
            labelmap.imageIdReferenceMap.forEach(derivedImagesId => {
                cache.removeImageLoadObject(derivedImagesId);
            });
        }
    });
}

function getSegmentationIds() {
    return csToolsSegmentation.state
        .getSegmentations()
        .map(x => x.segmentationId);
}

async function addSegmentationsToState(segmentationId: string) {
    //
    const derivedImages =
        await imageLoader.createAndCacheDerivedSegmentationImages(imageIds);

    //
    const imageIdReferenceMap =
        csToolsUtilities.segmentation.createImageIdReferenceMap(
            imageIds,
            derivedImages.imageIds
        );

    // Add the segmentations to state
    csToolsSegmentation.addSegmentations([
        {
            segmentationId,
            representation: {
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
                data: {
                    imageIdReferenceMap: imageIdReferenceMap
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
    return derivedImages;
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

function loadFileRequest(file: File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
        const fileReader = new FileReader();

        fileReader.onload = evt => {
            const arrayBuffer = evt.target.result as ArrayBuffer;

            resolve(arrayBuffer);
        };

        fileReader.onerror = reject;

        fileReader.readAsArrayBuffer(file);
    });
}

function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    //
    const files = evt.dataTransfer.files;

    // TODO
    readDicom([files[0]]);
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
            type: ViewportType.STACK,
            element: element1,
            defaultOptions: {
                background: [0.2, 0, 0.2]
            }
        }
    ];

    //
    renderingEngine.setViewports(viewportInputArray);
}

run();
