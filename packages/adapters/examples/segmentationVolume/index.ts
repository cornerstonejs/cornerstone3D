import { api } from "dicomweb-client";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

import { dicomMap } from "./demo";

import {
    addButtonToToolbar,
    addManipulationBindings,
    addToggleButtonToToolbar,
    addUploadToToolbar,
    createImageIdsAndCacheMetaData,
    initDemo,
    labelmapTools,
    setTitleAndDescription
} from "../../../../utils/demo/helpers";

import { BrushTool } from "@cornerstonejs/tools";

// This is for debugging purposes
console.warn(
    "Click on index.ts to open source code for this example --------->"
);

const { utilities: csUtilities } = cornerstone;
const { segmentation: csToolsSegmentation } = cornerstoneTools;
import {
    readDicom,
    readSegmentation,
    loadSegmentation,
    exportSegmentation,
    handleFileSelect,
    handleDragOver,
    restart,
    createSegmentation
} from "../segmentationVolume/utils";
import addDropDownToToolbar from "../../../../utils/demo/helpers/addDropdownToToolbar";

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
element3.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = e => e.preventDefault();
element2.oncontextmenu = e => e.preventDefault();
element3.oncontextmenu = e => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);
const info = document.createElement("div");
content.appendChild(info);
function addInstruction(text) {
    const instructions = document.createElement("p");
    instructions.innerText = `- ${text}`;
    info.appendChild(instructions);
}

addInstruction(
    "Load a source DICOM volume first, either using the 'Load DICOM' button or by dragging and dropping multiple DICOM files onto the viewports."
);
addInstruction(
    "Once a volume is loaded, you can import a DICOM SEG file by clicking 'Load SEG' "
);
addInstruction(
    "Use the brush tool to edit segmentation labels on the displayed volume."
);
addInstruction(
    "The 'Override Overlapping Segments' toggle allows you to choose how overlapping segments are handled during load"
);
addInstruction(
    "After making changes, click 'Export SEG' to download the updated segmentation as a DICOM SEG file."
);
addInstruction(
    "You can also upload local DICOM images or SEG files by using the 'Import DICOM' and 'Import SEG' buttons."
);

const state = {
    renderingEngine: null,
    renderingEngineId: "MY_RENDERING_ENGINE_ID",
    toolGroup: null,
    toolGroupId: "MY_TOOL_GROUP_ID",
    viewportIds: ["CT_AXIAL", "CT_SAGITTAL", "CT_CORONAL"],
    volumeId: "",
    segmentationId: "LOAD_SEG_ID:" + cornerstone.utilities.uuidv4(),
    referenceImageIds: [],
    skipOverlapping: false,
    segmentationIds: [],
    segImageIds: [],
    devConfig: { ...dicomMap.values().next().value }
};

viewportGrid.addEventListener("dragover", evt => handleDragOver(evt), false);
viewportGrid.addEventListener(
    "drop",
    evt => handleFileSelect(evt, state),
    false
);

async function loadDicom() {
    restart(state);

    const volumeLoaderScheme = "cornerstoneStreamingImageVolume";
    state.volumeId = volumeLoaderScheme + ":" + csUtilities.uuidv4();

    const volume = await cornerstone.volumeLoader.createAndCacheVolume(
        state.volumeId,
        {
            imageIds: state.referenceImageIds
        }
    );

    const { toolGroup, viewportIds, renderingEngineId, renderingEngine } =
        state;

    toolGroup.addViewport(viewportIds[0], renderingEngineId);
    toolGroup.addViewport(viewportIds[1], renderingEngineId);
    toolGroup.addViewport(viewportIds[2], renderingEngineId);

    await volume.load();
    await cornerstone.setVolumesForViewports(
        renderingEngine,
        [{ volumeId: state.volumeId }],
        viewportIds
    );

    renderingEngine.render();
}

function createSegmentationRepresentation() {
    const segMap = {
        [state.viewportIds[0]]: [{ segmentationId: state.segmentationId }],
        [state.viewportIds[1]]: [{ segmentationId: state.segmentationId }],
        [state.viewportIds[2]]: [{ segmentationId: state.segmentationId }]
    };

    csToolsSegmentation.addLabelmapRepresentationToViewportMap(segMap);
}

// ============================= //
addButtonToToolbar({
    id: "LOAD_DICOM",
    title: "Load DICOM",
    onClick: async () => {
        state.referenceImageIds = await createImageIdsAndCacheMetaData(
            state.devConfig.fetchDicom
        );
        await loadDicom(state.referenceImageIds, state);
    },
    container: group1
});

addButtonToToolbar({
    id: "LOAD_SEGMENTATION",
    title: "Load SEG",
    onClick: async () => {
        if (!state.volumeId) {
            alert("load source dicom first");
            return;
        }

        const configSeg = state.devConfig.fetchSegmentation;
        const client = new api.DICOMwebClient({
            url: configSeg.wadoRsRoot
        });
        const arrayBuffer = await client.retrieveInstance({
            studyInstanceUID: configSeg.StudyInstanceUID,
            seriesInstanceUID: configSeg.SeriesInstanceUID,
            sopInstanceUID: configSeg.SOPInstanceUID
        });

        await loadSegmentation(arrayBuffer, state);
        createSegmentationRepresentation();
        updateSegmentationDropdown();
    },
    container: group1
});

addUploadToToolbar({
    id: "IMPORT_DICOM",
    title: "Import DICOM",
    onChange: async (files: FileList) => {
        await readDicom(files, state);
        await loadDicom();
    },
    container: group2
});

addButtonToToolbar({
    id: "CREATE_SEGMENTATION",
    title: "Create Empty SEG",
    onClick: async () => {
        const segmentationId = cornerstone.utilities.uuidv4();
        state.segmentationId = segmentationId;
        await createSegmentation(state);
        createSegmentationRepresentation();
        updateSegmentationDropdown();
    },
    container: group2
});

addUploadToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    onChange: async (files: FileList) => {
        if (!state.volumeId) {
            return;
        }

        for (const file of files) {
            await readSegmentation(file, state);
        }

        createSegmentationRepresentation();
        updateSegmentationDropdown();
    },
    container: group2
});

function updateSegmentationDropdown() {
    // remove the previous dropdown
    const previousDropdown = document.getElementById("segmentation-dropdown");
    if (previousDropdown) {
        previousDropdown.remove();
    }

    state.segmentationIds = csToolsSegmentation.state
        .getSegmentations()
        .map(seg => seg.segmentationId);

    state.segmentationId =
        csToolsSegmentation.activeSegmentation.getActiveSegmentation(
            state.viewportIds[0]
        ).segmentationId;

    // Create a map with objects that can have properties set on them
    const optionsMap = new Map(
        state.segmentationIds.map(id => [
            id,
            { id, label: id, selected: id === state.segmentationId }
        ])
    );

    addDropDownToToolbar({
        container: group2,
        id: "segmentation-dropdown",
        options: {
            defaultIndex: state.segmentationIds.indexOf(state.segmentationId),
            map: optionsMap
        },
        onSelectedValueChange: (key: string | number) => {
            state.viewportIds.forEach(viewportId => {
                csToolsSegmentation.activeSegmentation.setActiveSegmentation(
                    viewportId,
                    key.toString()
                );
            });

            updateSegmentationDropdown();
        }
    });
}

addButtonToToolbar({
    id: "EXPORT_SEGMENTATION",
    title: "Export SEG",
    onClick: () => exportSegmentation(state)
});

addToggleButtonToToolbar({
    id: "SKIP_OVERLAPPING",
    title: "Override Overlapping Segments",
    onClick: () => {
        state.skipOverlapping = !state.skipOverlapping;
    },
    container: group1
});
// ============================= //

// ============================= //

/**
 * Runs the demo
 */
async function run() {
    await initDemo();

    state.toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(
        state.toolGroupId
    );
    addManipulationBindings(state.toolGroup, {
        toolMap: labelmapTools.toolMap
    });

    cornerstoneTools.addTool(BrushTool);

    state.toolGroup.addToolInstance("CircularBrush", BrushTool.toolName, {
        activeStrategy: "FILL_INSIDE_CIRCLE"
    });

    state.toolGroup.setToolActive("CircularBrush", {
        bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }
        ]
    });

    state.renderingEngine = new cornerstone.RenderingEngine(
        state.renderingEngineId
    );

    const viewportInputArray = [
        {
            viewportId: state.viewportIds[0],
            type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
            element: element1,
            defaultOptions: {
                orientation: cornerstone.Enums.OrientationAxis.AXIAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: state.viewportIds[1],
            type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
            element: element2,
            defaultOptions: {
                orientation: cornerstone.Enums.OrientationAxis.SAGITTAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: state.viewportIds[2],
            type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
            element: element3,
            defaultOptions: {
                orientation: cornerstone.Enums.OrientationAxis.CORONAL,
                background: [0.2, 0, 0.2]
            }
        }
    ];

    state.renderingEngine.setViewports(viewportInputArray);
}

run();
