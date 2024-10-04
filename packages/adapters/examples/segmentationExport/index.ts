/* eslint-disable */
import type { Types } from "@cornerstonejs/core";
import {
    RenderingEngine,
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
import { adaptersSEG, helpers } from "@cornerstonejs/adapters";
import dcmjs from "dcmjs";

const { downloadDICOMData } = helpers;

// This is for debugging purposes
console.warn(
    "Click on index.ts to open source code for this example --------->"
);

const { Cornerstone3D } = adaptersSEG;

const {
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

// ============================= //

addButtonToToolbar({
    title: "Create SEG",
    onClick: async () => {
        const volume = cache.getVolume(volumeId);
        const segUID = segmentationRepresentationUID[0];

        const images = volume.getCornerstoneImages();

        const labelmapObj =
            Cornerstone3D.Segmentation.generateLabelMaps2DFrom3D(
                segmentationVolume
            );

        // Generate fake metadata as an example
        labelmapObj.metadata = [];
        labelmapObj.segmentsOnLabelmap.forEach(segmentIndex => {
            const color = segmentation.config.color.getSegmentIndexColor(
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
});

/**
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function createMockEllipsoidSegmentation(
    segmentationVolume,
    outerRadius = 20,
    innerRadius = 10,
    center,
    labels = [1, 2]
) {
    const { dimensions, scalarData } = segmentationVolume;

    const centerToUse =
        center === "center"
            ? [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2]
            : center;

    let voxelIndex = 0;

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
            }
        }
    }
}

async function addSegmentationsToState() {
    // Create a segmentation of the same resolution as the source data
    segmentationVolume = await volumeLoader.createAndCacheDerivedLabelmapVolume(
        volumeId,
        {
            volumeId: segmentationId
        }
    );

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

    createMockEllipsoidSegmentation(
        segmentationVolume,
        40,
        20,
        [250, 100, 125],
        [1, 2]
    );
}

/**
 * Runs the demo
 */
async function run() {
    // Init Cornerstone and related libraries
    await initDemo();

    // Define tool groups to add the segmentation display tool to
    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

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
    setVolumesForViewports(
        renderingEngine,
        [{ volumeId }],
        [viewportId1, viewportId2, viewportId3]
    );

    // // Add the segmentation representation to the viewport
    segmentationRepresentationUID =
        await segmentation.addSegmentationRepresentations(viewportId1, [
            {
                segmentationId,
                type: csToolsEnums.SegmentationRepresentations.Labelmap
            }
        ]);
    await segmentation.addSegmentationRepresentations(viewportId2, [
        {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap
        }
    ]);
    await segmentation.addSegmentationRepresentations(viewportId3, [
        {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap
        }
    ]);

    // Render the image
    renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
