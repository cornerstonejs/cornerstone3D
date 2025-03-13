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

const { segmentation: csToolsSegmentation } = cornerstoneTools;
import {
    readDicom,
    readSegmentation,
    loadSegmentation,
    exportSegmentation,
    restart,
    handleFileSelect,
    handleDragOver,
    createEmptySegmentation
} from "../segmentationVolume/utils";

// ======== Set up page ======== //

setTitleAndDescription(
    "DICOM SEG STACK",
    "Here we demonstrate how to import or export a DICOM SEG from a Cornerstone3D stack."
);

const size = "500px";
const skipOverlapping = false;

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

const state = {
    renderingEngine: null,
    renderingEngineId: "MY_RENDERING_ENGINE_ID",
    toolGroup: null,
    toolGroupId: "MY_TOOL_GROUP_ID",
    viewportIds: ["CT_AXIAL"],
    segmentationId: "LOAD_SEG_ID:" + cornerstone.utilities.uuidv4(),
    referenceImageIds: [],
    segImageIds: [],
    skipOverlapping: false,
    devConfig: { ...dicomMap.values().next().value }
};

viewportGrid.addEventListener("dragover", evt => handleDragOver(evt), false);
viewportGrid.addEventListener(
    "drop",
    evt => handleFileSelect(evt, state),
    false
);

function loadDicom() {
    restart(state);

    const { toolGroup, viewportIds, renderingEngineId, renderingEngine } =
        state;

    toolGroup.addViewport(viewportIds[0], renderingEngineId);

    const viewport = state.renderingEngine.getStackViewport(viewportIds[0]);

    viewport.setStack(state.referenceImageIds);
    cornerstoneTools.utilities.stackContextPrefetch.enable(element1);

    renderingEngine.render();
}

function createSegmentationRepresentation() {
    csToolsSegmentation.addLabelmapRepresentationToViewport(
        state.viewportIds[0],
        [{ segmentationId: state.segmentationId }]
    );
}

// ============================= //
addButtonToToolbar({
    id: "LOAD_DICOM",
    title: "Load DICOM",
    onClick: async () => {
        state.referenceImageIds = await createImageIdsAndCacheMetaData(
            state.devConfig.fetchDicom
        );

        loadDicom();
    },
    container: group1
});

addButtonToToolbar({
    id: "LOAD_SEGMENTATION",
    title: "Load SEG",
    onClick: async () => {
        if (!state.referenceImageIds.length) {
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
        await createEmptySegmentation(state);
        createSegmentationRepresentation();
    },
    container: group2
});

addUploadToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    onChange: async (files: FileList) => {
        for (const file of files) {
            await readSegmentation(file, state);
        }

        createSegmentationRepresentation();
    },
    container: group2
});

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
            type: cornerstone.Enums.ViewportType.STACK,
            element: element1
        }
    ];

    state.renderingEngine.setViewports(viewportInputArray);
}

run();
