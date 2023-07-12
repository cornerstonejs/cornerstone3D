import {
    RenderingEngine,
    Types,
    Enums,
    setVolumesForViewports,
    volumeLoader,
    cache,
    metaData
} from "@cornerstonejs/core";
import {
    initDemo,
    setTitleAndDescription,
    addButtonToToolbar,
    createImageIdsAndCacheMetaData
} from "../../../../utils/demo/helpers";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { adaptersSEG } from "@cornerstonejs/adapters";
import dcmjs from "dcmjs";

// This is for debugging purposes
console.warn(
    "Click on index.ts to open source code for this example --------->"
);

const { Cornerstone3D } = adaptersSEG;

const {
    SegmentationDisplayTool,
    StackScrollMouseWheelTool,
    ToolGroupManager,
    Enums: csToolsEnums,
    segmentation
} = cornerstoneTools;

const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = "CT_VOLUME_ID"; // Id of the volume less loader prefix
const volumeLoaderScheme = "cornerstoneStreamingImageVolume"; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = "MY_SEGMENTATION_ID";
const toolGroupId = "MY_TOOLGROUP_ID";
// Create the viewports
const viewportId1 = "CT_AXIAL";
const viewportId2 = "CT_SAGITTAL";
const viewportId3 = "CT_CORONAL";

// ======== Set up page ======== //
setTitleAndDescription(
    "DICOM SEG Export",
    "Here we demonstrate how to export a DICOM SEG from a Cornerstone3D volume."
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
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);
let renderingEngine;
let segmentationVolume;
let segmentationRepresentationUID;

function generateMockMetadata(segmentIndex, color) {
    // TODO -> Use colors from the cornerstoneTools LUT.
    const RecommendedDisplayCIELabValue = dcmjs.data.Colors.rgb2DICOMLAB(
        color.slice(0, 3)
    );

    const colorAgain = dcmjs.data.Colors.dicomlab2RGB(
        RecommendedDisplayCIELabValue
    );

    return {
        SegmentedPropertyCategoryCodeSequence: {
            CodeValue: "T-D0050",
            CodingSchemeDesignator: "SRT",
            CodeMeaning: "Tissue"
        },
        SegmentNumber: (segmentIndex + 1).toString(),
        SegmentLabel: "Tissue " + (segmentIndex + 1).toString(),
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

// ============================= //

addButtonToToolbar({
    title: "Create SEG",
    onClick: async () => {
        const volume = cache.getVolume(volumeId);

        const volumeImages = volume.convertToCornerstoneImages();
        const imagePromises = volumeImages.map(image => image.promise);

        await Promise.all(imagePromises).then(images => {
            const labelmap3D =
                Cornerstone3D.Segmentation.generateLabelMaps2DFrom3D(
                    segmentationVolume
                );

            const segUID = segmentationRepresentationUID[0];

            labelmap3D.metadata = [];
            // labelmap3D.labelmaps2D.forEach(labelmap2D => {
            labelmap3D.segmentsOnLabelmap.forEach(segmentIndex => {
                const color = segmentation.config.color.getColorForSegmentIndex(
                    toolGroupId,
                    segUID,
                    segmentIndex
                );

                console.debug("color", segmentIndex, color);
                const segmentMetadata = generateMockMetadata(
                    segmentIndex,
                    color
                );
                labelmap3D.metadata[segmentIndex] = segmentMetadata;
            });

            const segBlob = Cornerstone3D.Segmentation.generateSegmentation(
                images,
                labelmap3D,
                metaData
            );

            //Create a URL for the binary.
            const objectUrl = URL.createObjectURL(segBlob);
            window.open(objectUrl);
        });
    }
});

/**
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function createMockEllipsoidSegmentation(
    segmentationVolume,
    outerRadius = 20,
    innerRadius = 10,
    center = "center",
    labels = [1, 2]
    // mode = "first"
) {
    const { dimensions, scalarData, imageData } = segmentationVolume;

    const centerToUse =
        center === "center"
            ? [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2]
            : center;

    let voxelIndex = 0;

    // const zToUse =
    //     mode === "first" ? [0, 1] : [dimensions[2] - 1, dimensions[2]];

    for (let z = 0; z < dimensions[2]; z++) {
        for (let y = 0; y < dimensions[1]; y++) {
            for (let x = 0; x < dimensions[0]; x++) {
                const distanceFromCenter = Math.sqrt(
                    (x - centerToUse[0]) * (x - centerToUse[0]) +
                        (y - centerToUse[1]) * (y - centerToUse[1]) +
                        (z - centerToUse[2]) * (z - centerToUse[2])
                );
                if (distanceFromCenter < innerRadius) {
                    scalarData[voxelIndex] = labels[0];
                } else if (distanceFromCenter < outerRadius) {
                    scalarData[voxelIndex] = labels[1];
                }

                voxelIndex++;
                // const index = imageData.computeOffsetIndex([x, y, z]);
                // scalarData[index] = labels[1];
            }
        }
    }
}

async function addSegmentationsToState() {
    // Create a segmentation of the same resolution as the source data
    // using volumeLoader.createAndCacheDerivedVolume.
    segmentationVolume = await volumeLoader.createAndCacheDerivedVolume(
        volumeId,
        {
            volumeId: segmentationId
        }
    );

    // segmentationVolume2 = await volumeLoader.createAndCacheDerivedVolume(
    //     volumeId,
    //     {
    //         volumeId: `${segmentationId}2`
    //     }
    // );

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
    // segmentation.addSegmentations([
    //     {
    //         segmentationId: `${segmentationId}2`,
    //         representation: {
    //             // The type of segmentation
    //             type: csToolsEnums.SegmentationRepresentations.Labelmap,
    //             // The actual segmentation data, in the case of labelmap this is a
    //             // reference to the source volume of the segmentation.
    //             data: {
    //                 volumeId: `${segmentationId}2`
    //             }
    //         }
    //     }
    // ]);

    // Add some data to the segmentations
    // createMockEllipsoidSegmentation(segmentationVolume);
    createMockEllipsoidSegmentation(
        segmentationVolume,
        40,
        20,
        [250, 100, 125],
        [2, 5]
    );
}

/**
 * Runs the demo
 */
async function run() {
    // Init Cornerstone and related libraries
    await initDemo();

    // Add tools to Cornerstone3D
    cornerstoneTools.addTool(SegmentationDisplayTool);
    cornerstoneTools.addTool(StackScrollMouseWheelTool);

    // Define tool groups to add the segmentation display tool to
    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

    toolGroup.addTool(SegmentationDisplayTool.toolName);
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

    // Get Cornerstone imageIds for the source data and fetch metadata into RAM
    const imageIds = await createImageIdsAndCacheMetaData({
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

    // Add some segmentations based on the source data volume
    await addSegmentationsToState();

    // Instantiate a rendering engine
    const renderingEngineId = "myRenderingEngine";
    renderingEngine = new RenderingEngine(renderingEngineId);

    const viewportInputArray = [
        {
            viewportId: viewportId1,
            type: ViewportType.ORTHOGRAPHIC,
            element: element1,
            defaultOptions: {
                orientation: Enums.OrientationAxis.AXIAL,
                background: <Types.Point3>[0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportId2,
            type: ViewportType.ORTHOGRAPHIC,
            element: element2,
            defaultOptions: {
                orientation: Enums.OrientationAxis.SAGITTAL,
                background: <Types.Point3>[0.2, 0, 0.2]
            }
        },
        {
            viewportId: viewportId3,
            type: ViewportType.ORTHOGRAPHIC,
            element: element3,
            defaultOptions: {
                orientation: Enums.OrientationAxis.CORONAL,
                background: <Types.Point3>[0.2, 0, 0.2]
            }
        }
    ];

    renderingEngine.setViewports(viewportInputArray);

    toolGroup.addViewport(viewportId1, renderingEngineId);
    toolGroup.addViewport(viewportId2, renderingEngineId);
    toolGroup.addViewport(viewportId3, renderingEngineId);

    // Set the volume to load
    volume.load();

    // Set volumes on the viewports
    await setVolumesForViewports(
        renderingEngine,
        [{ volumeId }],
        [viewportId1, viewportId2, viewportId3]
    );

    // // Add the segmentation representation to the toolgroup
    segmentationRepresentationUID =
        await segmentation.addSegmentationRepresentations(toolGroupId, [
            {
                segmentationId,
                type: csToolsEnums.SegmentationRepresentations.Labelmap
            }
        ]);
    // await segmentation.addSegmentationRepresentations(toolGroupId, [
    //     {
    //         segmentationId: `${segmentationId}2`,
    //         type: csToolsEnums.SegmentationRepresentations.Labelmap
    //     }
    // ]);

    // Render the image
    renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
