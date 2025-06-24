import type { Types } from "@cornerstonejs/core";
import {
    utilities as csUtilities,
    volumeLoader,
    setVolumesForViewports,
    Enums as csEnums,
    RenderingEngine
} from "@cornerstonejs/core";
import {
    segmentation as csToolsSegmentation,
    ToolGroupManager,
    addTool,
    Enums as csToolsEnums
} from "@cornerstonejs/tools";

import {
    addButtonToToolbar,
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

import {
    readSegmentation,
    handleFileSelect,
    handleDragOver,
    restart
} from "../segmentationVolume/utils";
import addDropDownToToolbar from "../../../../utils/demo/helpers/addDropdownToToolbar";

setTitleAndDescription(
    "Labelmap Segmentation",
    "Here we demonstrate LABELMAP DICOM Segmentation working on a volume and stack viewport."
);

const size = "300px";

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
viewportGrid.addEventListener(
    "drop",
    evt => handleFileSelect(evt, state),
    false
);

const element1 = document.createElement("div");
element1.style.width = size;
element1.style.height = size;
element1.title = "Volume: AXIAL";
const element2 = document.createElement("div");
element2.style.width = size;
element2.style.height = size;
element2.title = "Volume: SAGITTAL";
const element3 = document.createElement("div");
element3.style.width = size;
element3.style.height = size;
element3.title = "Volume: CORONAL";
const element4 = document.createElement("div");
element4.style.width = size;
element4.style.height = size;
element4.title = "Stack: ACQUISITION";

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = e => e.preventDefault();
element2.oncontextmenu = e => e.preventDefault();
element3.oncontextmenu = e => e.preventDefault();
element4.oncontextmenu = e => e.preventDefault();

// Update viewportGrid to use CSS grid for 2x2 layout
viewportGrid.style.display = "grid";
viewportGrid.style.gridTemplateColumns = "1fr 1fr";
viewportGrid.style.gridTemplateRows = "1fr 1fr";
viewportGrid.style.columnGap = "8px";
viewportGrid.style.rowGap = "8px";
viewportGrid.style.width = `calc(2 * ${size} + 2px)`; // tightly fit 2 columns and gap
viewportGrid.style.justifyContent = "start";
viewportGrid.style.alignContent = "start";
viewportGrid.style.margin = "0 auto";

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);
viewportGrid.appendChild(element4);

content.appendChild(viewportGrid);
// Remove centering styles, left justify the grid
content.style.display = "block";
viewportGrid.style.margin = "16px 0 0 0";
const info = document.createElement("div");
content.appendChild(info);
function addInstruction(text) {
    const instructions = document.createElement("p");
    instructions.innerText = `- ${text}`;
    info.appendChild(instructions);
}

addInstruction("Load a source DICOM volume first, using the 'Load DICOM'");
addInstruction(
    "Once a volume is loaded, import the Labelmap DICOM SEG file by clicking 'Load SEG' "
);

const state = {
    renderingEngine: null,
    renderingEngineId: "MY_RENDERING_ENGINE_ID",
    toolGroup: null,
    toolGroupId: "MY_TOOL_GROUP_ID",
    viewportIds: ["CT_AXIAL", "CT_SAGITTAL", "CT_CORONAL", "CT_4TH"],
    volumeId: "",
    segmentationId: "LOAD_SEG_ID:" + csUtilities.uuidv4(),
    referenceImageIds: [],
    skipOverlapping: false,
    segmentationIds: [],
    segImageIds: [],
    devConfig: {
        StudyInstanceUID:
            "2.16.840.1.114362.1.11972228.22789312658.616067305.306.2",
        SeriesInstanceUID:
            "2.16.840.1.114362.1.11972228.22789312658.616067305.306.3",
        wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
    }
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

    const volume = await volumeLoader.createAndCacheVolume(state.volumeId, {
        imageIds: state.referenceImageIds
    });

    const { toolGroup, viewportIds, renderingEngineId, renderingEngine } =
        state;

    toolGroup.addViewport(viewportIds[0], renderingEngineId);
    toolGroup.addViewport(viewportIds[1], renderingEngineId);
    toolGroup.addViewport(viewportIds[2], renderingEngineId);
    toolGroup.addViewport(viewportIds[3], renderingEngineId);

    await volume.load();
    await setVolumesForViewports(
        renderingEngine,
        [{ volumeId: state.volumeId }],
        viewportIds.slice(0, 3)
    );
    const viewport = renderingEngine.getViewport(
        viewportIds[3]
    ) as Types.IStackViewport;

    await viewport.setStack(state.referenceImageIds);

    renderingEngine.render();
}

function createSegmentationRepresentation() {
    const segMap = {
        [state.viewportIds[0]]: [{ segmentationId: state.segmentationId }],
        [state.viewportIds[1]]: [{ segmentationId: state.segmentationId }],
        [state.viewportIds[2]]: [{ segmentationId: state.segmentationId }],
        [state.viewportIds[3]]: [{ segmentationId: state.segmentationId }]
    };

    csToolsSegmentation.addLabelmapRepresentationToViewportMap(segMap);
}

// ============================= //
addButtonToToolbar({
    id: "LOAD_DICOM",
    title: "Load DICOM",
    onClick: async () => {
        state.referenceImageIds = await createImageIdsAndCacheMetaData(
            state.devConfig
        );
        await loadDicom();
    },
    container: group1
});

addUploadToToolbar({
    id: "IMPORT_SEGMENTATION",
    title: "Import SEG",
    onChange: async (files: FileList) => {
        if (!state.volumeId) {
            return;
        }

        const start = performance.now();
        for (const file of files) {
            await readSegmentation(file, state);
        }
        const end = performance.now();
        console.log(`Segmentation load time: ${(end - start).toFixed(2)} ms`);

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

/**
 * Runs the demo
 */
async function run() {
    await initDemo();

    state.toolGroup = ToolGroupManager.createToolGroup(state.toolGroupId);
    addManipulationBindings(state.toolGroup, {
        toolMap: labelmapTools.toolMap
    });

    state.renderingEngine = new RenderingEngine(state.renderingEngineId);

    const viewportInputArray = [
        {
            viewportId: state.viewportIds[0],
            type: csEnums.ViewportType.ORTHOGRAPHIC,
            element: element1,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.AXIAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: state.viewportIds[1],
            type: csEnums.ViewportType.ORTHOGRAPHIC,
            element: element2,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.SAGITTAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: state.viewportIds[2],
            type: csEnums.ViewportType.ORTHOGRAPHIC,
            element: element3,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.CORONAL,
                background: [0.2, 0, 0.2]
            }
        },
        {
            viewportId: state.viewportIds[3],
            type: csEnums.ViewportType.STACK,
            element: element4,
            defaultOptions: {
                orientation: csEnums.OrientationAxis.ACQUISITION,
                background: [0.2, 0, 0.2]
            }
        }
    ];

    state.renderingEngine.setViewports(viewportInputArray);
}

run();
