import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneAdapters from "@cornerstonejs/adapters";

import {
    addButtonToToolbar,
    addDropdownToToolbar,
    addManipulationBindings,
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
    segmentation
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

const { wadors, wadouri } = cornerstoneDicomImageLoader;

const { adaptersSEG, helpers } = cornerstoneAdapters;
const { Cornerstone3D } = adaptersSEG;
const { downloadDICOMData } = helpers;

//
const volumeName = "CT_VOLUME_ID";
const volumeLoaderScheme = "cornerstoneStreamingImageVolume";
const volumeId = `${volumeLoaderScheme}:${volumeName}`;

let renderingEngine;
const renderingEngineId = "MY_RENDERING_ENGINE_ID";
const toolGroupId = "MY_TOOL_GROUP_ID";
const viewportIds: string[] = ["CT_AXIAL", "CT_SAGITTAL", "CT_CORONAL"];
let imageIds: string[] = [];

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

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = e => e.preventDefault();
element2.oncontextmenu = e => e.preventDefault();
element3.oncontextmenu = e => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

createInfoSection(content).addInstruction(
    "Viewports: Axial | Sagittal | Coronal"
);

// ============================= //

function importSegmentation() {
    const elInput = document.createElement("input");
    elInput.type = "file";
    elInput.multiple = true;
    elInput.addEventListener("change", async function (evt) {
        const files = evt.target.files;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            await readSegmentation(file);
        }

        // Input remove
        elInput.remove();
    });
    document.body.appendChild(elInput);

    // Input click
    elInput.click();
}

async function readSegmentation(file) {
    const imageId = wadouri.fileManager.add(file);

    const image = await imageLoader.loadAndCacheImage(imageId);

    if (!image) {
        return;
    }

    const instance = metaData.get("instance", imageId);

    if (instance.Modality !== "SEG") {
        console.error("This is not segmentation");
        return;
    }

    const arrayBuffer = image.data.byteArray.buffer;

    loadSegmentation(arrayBuffer);
}

async function loadSegmentation(arrayBuffer) {
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
    const cacheVolume = cache.getVolume(volumeId);
    const csImages = cacheVolume.getCornerstoneImages();

    // Get active segmentation representation
    const activeSegmentationRepresentation =
        segmentation.activeSegmentation.getActiveSegmentationRepresentation(
            toolGroupId
        );

    const cacheSegmentationVolume = cache.getVolume(
        activeSegmentationRepresentation.segmentationId
    );
    const activeSegmentationRepresentationUid =
        activeSegmentationRepresentation.segmentationRepresentationUID;

    const labelmap = Cornerstone3D.Segmentation.generateLabelMaps2DFrom3D(
        cacheSegmentationVolume
    );

    // Generate fake metadata as an example
    labelmap.metadata = [];
    labelmap.segmentsOnLabelmap.forEach(segmentIndex => {
        const color = segmentation.config.color.getColorForSegmentIndex(
            toolGroupId,
            activeSegmentationRepresentationUid,
            segmentIndex
        );

        const segmentMetadata = generateMockMetadata(segmentIndex, color);
        labelmap.metadata[segmentIndex] = segmentMetadata;
    });

    const generatedSegmentation =
        Cornerstone3D.Segmentation.generateSegmentation(
            csImages,
            labelmap,
            metaData
        );

    downloadDICOMData(generatedSegmentation.dataset, "mySEG.dcm");
}

// ============================= //

addButtonToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    onClick: importSegmentation,
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
    labelText: "Tools: ",
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
    style: {
        marginRight: "10px"
    },
    container: group2
});

addDropdownToToolbar({
    id: "ACTIVE_SEGMENTATION_DROPDOWN",
    labelText: "Set Active Segmentation",
    options: { values: [], defaultValue: "" },
    onSelectedValueChange: nameAsStringOrNumber => {
        const segmentationId = String(nameAsStringOrNumber);

        const segmentationRepresentations =
            segmentation.state.getSegmentationIdRepresentations(segmentationId);

        segmentation.activeSegmentation.setActiveSegmentationRepresentation(
            toolGroupId,
            segmentationRepresentations[0].segmentationRepresentationUID
        );

        // Update the dropdown
        updateSegmentationDropdown(segmentationId);
    },
    container: group2
});

// ============================= //

function getSegmentationIds() {
    return segmentation.state.getSegmentations().map(x => x.segmentationId);
}

function metaDataProvider(type, imageId) {
    if (Array.isArray(imageId)) {
        return;
    }

    //
    const metaData = wadors.metaDataManager.get(imageId);
    //
    if (metaData) {
        // TODO
        if (type === "generalImageModule") {
            return {
                sopInstanceUid: metaData["00080018"].Value[0]
            };
        }

        return;
    }

    //
    const imageUri = csUtilities.imageIdToURI(imageId);
    //
    const dataSet = wadouri.dataSetCacheManager.get(imageUri);
    //
    if (dataSet) {
        // TODO
        if (type === "generalImageModule") {
            return {
                sopInstanceUid: dataSet.string("x00080018")
            };
        }

        return;
    }
}

async function addSegmentationsToState(segmentationId: string) {
    // Create a segmentation of the same resolution as the source data
    const derivedVolume =
        await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId, {
            volumeId: segmentationId
        });

    // Add the segmentations to state
    segmentation.addSegmentations([
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
    await segmentation.addSegmentationRepresentations(toolGroupId, [
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

async function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    //
    const files = evt.dataTransfer.files;

    //
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        await readSegmentation(file);
    }
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

    // TODO
    metaData.addProvider(metaDataProvider, 1);

    //
    labelmapTools.toolMap.forEach(x => {
        if (x.configuration?.preview) {
            x.configuration.preview.enabled = false;
        }
    });

    // Define tool groups to add the segmentation display tool to
    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
    addManipulationBindings(toolGroup, { toolMap: labelmapTools.toolMap });
    cornerstoneTools.addTool(SegmentationDisplayTool);
    toolGroup.addTool(SegmentationDisplayTool.toolName);

    // Get Cornerstone imageIds for the source data and fetch metadata into RAM
    imageIds = await createImageIdsAndCacheMetaData({
        StudyInstanceUID:
            "1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463",
        SeriesInstanceUID:
            "1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561",
        wadoRsRoot: "https://d3t6nz73ql33tx.cloudfront.net/dicomweb"
    });

    // Define a volume in memory
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds
    });

    //
    const newSegmentationId = "MY_SEGMENTATION_ID:" + csUtilities.uuidv4();
    // Add some segmentations based on the source data volume
    await addSegmentationsToState(newSegmentationId);
    //
    updateSegmentationDropdown(newSegmentationId);

    // Instantiate a rendering engine
    renderingEngine = new RenderingEngine(renderingEngineId);

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

    renderingEngine.setViewports(viewportInputArray);

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

run();
