import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneAdapters from "@cornerstonejs/adapters";

import {
    addButtonToToolbar,
    addDropdownToToolbar,
    addManipulationBindings,
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

// Define a unique id for the volume
const volumeName = "CT_VOLUME_ID"; // Id of the volume less loader prefix
const volumeLoaderScheme = "cornerstoneStreamingImageVolume"; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
/* const segmentationId = "MY_SEGMENTATION_ID"; */

let renderingEngine;
const renderingEngineId = "myRenderingEngine";
let toolGroup;
const toolGroupId = "MY_TOOL_GROUP_ID";
let imageIds = [];

const viewportId1 = "CT_ACQUISITION";
const viewportId2 = "CT_AXIAL";
const viewportId3 = "CT_SAGITTAL";
const viewportId4 = "CT_CORONAL";

const segmentationIds = [];
const segmentationRepresentationUIDs = [];

// ======== Set up page ======== //
setTitleAndDescription(
    "DICOM SEG VOLUME LOCAL",
    "Here we demonstrate how to import or export a DICOM SEG from a Cornerstone3D volume."
);

const size = "500px";
const content = document.getElementById("content");
const viewportGrid = document.createElement("div");

viewportGrid.style.display = "flex";
viewportGrid.style.display = "flex";
viewportGrid.style.flexDirection = "row";

const element1 = document.createElement("div");
const element2 = document.createElement("div");
const element3 = document.createElement("div");
const element4 = document.createElement("div");
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;
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

// ============================= //

function openImportDicom() {
    const elInput = document.createElement("input");
    elInput.type = "file";
    elInput.multiple = true;
    elInput.addEventListener("change", async function (evt) {
        const files = evt.target.files;

        readDicom(files);

        // Input remove
        elInput.remove();
    });
    document.body.appendChild(elInput);

    // Input click
    elInput.click();
}

async function readDicom(files) {
    imageIds = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const imageId = wadouri.fileManager.add(file);

        await imageLoader.loadAndCacheImage(imageId);

        imageIds.push(imageId);
    }

    await loadDicom(imageIds);
}

async function loadDicom(imageIds) {
    // Define a volume in memory
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds
    });

    //
    const newSegmentationId = "MY_SEGMENTATION_ID:" + csUtilities.uuidv4();
    // Add some segmentations based on the source data volume
    await addSegmentationsToState(newSegmentationId);
    //
    updateSegmentationDropdownOptions(segmentationIds);

    toolGroup.addViewport(viewportId1, renderingEngineId);
    toolGroup.addViewport(viewportId2, renderingEngineId);
    toolGroup.addViewport(viewportId3, renderingEngineId);
    toolGroup.addViewport(viewportId4, renderingEngineId);

    // Set the volume to load
    volume.load();

    //
    const viewports = [viewportId1, viewportId2, viewportId3, viewportId4];

    // Set volumes on the viewports
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewports);

    // Render the image
    renderingEngine.renderViewports(viewports);
}

function updateSegmentationDropdownOptions(
    segmentationIds,
    activeSegmentationId?
) {
    const dropdown = document.getElementById(
        "SEGMENTATION_DROPDOWN"
    ) as HTMLSelectElement;

    dropdown.innerHTML = "";

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

/* function deleteActiveSegmentation() {
    //
} */

async function saveSegmentation() {
    const cacheVolume = cache.getVolume(volumeId);
    const cacheSegmentationVolume = cache.getVolume(segmentationIds[0]);
    const segUID = segmentationRepresentationUIDs[0];

    const images = cacheVolume.getCornerstoneImages();

    const labelmapObj = Cornerstone3D.Segmentation.generateLabelMaps2DFrom3D(
        cacheSegmentationVolume
    );

    // Generate fake metadata as an example
    labelmapObj.metadata = [];
    labelmapObj.segmentsOnLabelmap.forEach(segmentIndex => {
        const color = segmentation.config.color.getColorForSegmentIndex(
            toolGroupId,
            segUID,
            segmentIndex
        );

        const segmentMetadata = generateMockMetadata(segmentIndex, color);
        labelmapObj.metadata[segmentIndex] = segmentMetadata;
    });

    const generatedSegmentation =
        Cornerstone3D.Segmentation.generateSegmentation(
            images,
            labelmapObj,
            metaData
        );

    downloadDICOMData(generatedSegmentation.dataset, "mySEG.dcm");
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

function openImport() {
    const elInput = document.createElement("input");
    elInput.type = "file";
    elInput.addEventListener("change", async function (evt) {
        const files = evt.target.files;

        readSegmentation(files[0]);

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
    updateSegmentationDropdownOptions(segmentationIds, newSegmentationId);
}

addButtonToToolbar({
    id: "IMPORT_DICOM",
    title: "Import DICOM",
    onClick: openImportDicom
});

addDropdownToToolbar({
    id: "LABELMAP_TOOLS",
    options: { map: labelmapTools.toolMap },
    onSelectedValueChange: nameAsStringOrNumber => {
        const name = String(nameAsStringOrNumber);
        const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

        // Set the currently active tool disabled
        const toolName = toolGroup.getActivePrimaryMouseButtonTool();

        if (toolName) {
            toolGroup.setToolDisabled(toolName);
        }

        toolGroup.setToolActive(name, {
            bindings: [{ mouseButton: MouseBindings.Primary }]
        });
    }
});

addDropdownToToolbar({
    id: "SEGMENTATION_DROPDOWN",
    labelText: "Set Active Segmentation",
    options: { values: segmentationIds, defaultValue: "" },
    onSelectedValueChange: nameAsStringOrNumber => {
        const name = String(nameAsStringOrNumber);
        const index = segmentationIds.indexOf(name);
        const uid = segmentationRepresentationUIDs[index];
        segmentation.activeSegmentation.setActiveSegmentationRepresentation(
            toolGroupId,
            uid
        );

        // Update the dropdown
        updateSegmentationDropdownOptions(segmentationIds, name);
    }
});

/* addButtonToToolbar({
    title: "Delete Active Segmentation",
    onClick: deleteActiveSegmentation
}); */

addButtonToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    onClick: openImport
});

addButtonToToolbar({
    id: "EXPORT_SEGMENTATION",
    title: "Export SEG",
    onClick: saveSegmentation
});

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

async function addSegmentationsToState(segmentationId) {
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
    segmentationIds.push(segmentationId);

    // Add the segmentation representation to the toolgroup
    const segmentationRepresentations =
        await segmentation.addSegmentationRepresentations(toolGroupId, [
            {
                segmentationId,
                type: csToolsEnums.SegmentationRepresentations.Labelmap
            }
        ]);
    segmentationRepresentationUIDs.push(segmentationRepresentations[0]);

    //
    return derivedVolume;
}

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
    toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
    addManipulationBindings(toolGroup, { toolMap: labelmapTools.toolMap });
    cornerstoneTools.addTool(SegmentationDisplayTool);
    toolGroup.addTool(SegmentationDisplayTool.toolName);

    // Instantiate a rendering engine
    renderingEngine = new RenderingEngine(renderingEngineId);

    const viewportInputArray = [
        {
            viewportId: viewportId1,
            type: ViewportType.ORTHOGRAPHIC,
            element: element1,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.ACQUISITION,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportId2,
            type: ViewportType.ORTHOGRAPHIC,
            element: element2,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.AXIAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportId3,
            type: ViewportType.ORTHOGRAPHIC,
            element: element3,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.SAGITTAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportId4,
            type: ViewportType.ORTHOGRAPHIC,
            element: element4,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.CORONAL,
                background: [0.2, 0, 0.2]
            }
        }
    ];

    renderingEngine.setViewports(viewportInputArray);
}

run();
