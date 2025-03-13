import { api } from "dicomweb-client";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

import { dicomMap } from "./demo";

import {
    addButtonToToolbar,
    addManipulationBindings,
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

const { segmentation: csToolsSegmentation, Enums: ToolsEnums } =
    cornerstoneTools;
const { imageLoader, eventTarget, Enums: CoreEnums } = cornerstone;
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

import * as testUtils from "../../../../utils/test/testUtils";

const { encodeImageIdInfo, compareImages } = testUtils;

// ======== Set up page ======== //

setTitleAndDescription(
    "DICOM SEG STACK",
    "Here we demonstrate how to import or export a DICOM SEG from a Cornerstone3D stack."
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

addButtonToToolbar({
    id: "SIMULATE_TEST",
    title: "SIMULATE FAILING TEST",
    onClick: () => {
        const renderingEngineId = "renderingEngineId-stackSegmentation_test";
        const toolGroupId = "toolGroupId-stackSegmentation_test";
        const segmentationId = "segmentationId-stackSegmentation_test";
        const segmentationId2 = "segmentationId2-stackSegmentation_test";
        const viewportId1 = "STACK_VIEWPORT";

        const testEnv = testUtils.setupTestEnvironment({
            renderingEngineId,
            toolGroupIds: [toolGroupId],
            viewportIds: [viewportId1]
        });

        const segToolGroup = testEnv.toolGroups[toolGroupId];
        const renderingEngine = testEnv.renderingEngine;

        cornerstoneTools.addTool(BrushTool);
        segToolGroup.addToolInstance("CircularBrush", BrushTool.toolName, {
            activeStrategy: "FILL_INSIDE_CIRCLE"
        });
        segToolGroup.setToolActive("CircularBrush", {
            bindings: [{ mouseButton: 1 }]
        });
        testUtils.createViewports(renderingEngine, {
            viewportType: CoreEnums.ViewportType.STACK,
            viewportId: viewportId1
        });

        const imageInfo1 = {
            loader: "fakeImageLoader",
            name: "imageURI",
            rows: 64,
            columns: 64,
            barStart: 10,
            barWidth: 5,
            xSpacing: 1,
            ySpacing: 1,
            sliceIndex: 0
        };

        const imageId1 = encodeImageIdInfo(imageInfo1);
        // console.debug("🚀 ~ imageId1:", imageId1)
        const vp = renderingEngine.getViewport(
            viewportId1
        ) as cornerstone.StackViewport;
        // console.debug("🚀 ~ vp:")

        let renderCount = 0;
        const expectedRenderCount = 2; // We expect two segmentations to be rendered

        eventTarget.addEventListener(
            ToolsEnums.Events.SEGMENTATION_RENDERED,
            evt => {
                renderCount++;

                if (renderCount === expectedRenderCount) {
                    // console.debug("🚀 ~ eventTarget.addEventListener ~ renderCount === expectedRenderCount:", renderCount === expectedRenderCount)
                    const canvas = vp.getCanvas();
                    const image = canvas.toDataURL("image/png");
                    compareImages(
                        image,
                        {
                            default:
                                "data:image/png;base64,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"
                        },
                        "imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked"
                    ).then(() => console.log("I'm done"), console.error);
                }
            }
        );

        try {
            vp.setStack([imageId1], 0).then(() => {
                const segImage1 =
                    imageLoader.createAndCacheDerivedLabelmapImage(imageId1);
                // console.debug("🚀 ~ vp.setStack ~ segImage1:")
                const segImage2 =
                    imageLoader.createAndCacheDerivedLabelmapImage(imageId1);
                // console.debug("🚀 ~ vp.setStack ~ segImage2:")

                testUtils.fillStackSegmentationWithMockData({
                    imageIds: [imageId1],
                    segmentationImageIds: [segImage1.imageId],
                    cornerstone
                });
                testUtils.fillStackSegmentationWithMockData({
                    imageIds: [imageId1],
                    segmentationImageIds: [segImage2.imageId],
                    centerOffset: [30, 30, 0],
                    innerValue: 4,
                    outerValue: 5,
                    cornerstone
                });

                csToolsSegmentation.addSegmentations([
                    {
                        segmentationId,
                        representation: {
                            type: ToolsEnums.SegmentationRepresentations
                                .Labelmap,
                            data: {
                                imageIds: [segImage1.imageId]
                            }
                        }
                    }
                ]);
                csToolsSegmentation.addSegmentations([
                    {
                        segmentationId: segmentationId2,
                        representation: {
                            type: ToolsEnums.SegmentationRepresentations
                                .Labelmap,
                            data: {
                                imageIds: [segImage2.imageId]
                            }
                        }
                    }
                ]);

                csToolsSegmentation.addSegmentationRepresentations(
                    viewportId1,
                    [
                        {
                            segmentationId,
                            type: ToolsEnums.SegmentationRepresentations
                                .Labelmap
                        }
                    ]
                );
                csToolsSegmentation.addSegmentationRepresentations(
                    viewportId1,
                    [
                        {
                            segmentationId: segmentationId2,
                            type: ToolsEnums.SegmentationRepresentations
                                .Labelmap
                        }
                    ]
                );

                renderingEngine.render();
            });
        } catch (e) {
            console.error("🚀 ~ e:", e);
        }
    }
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
