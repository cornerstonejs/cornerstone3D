import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
  utilities as csUtils,
} from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  ZoomTool,
  SegmentationDisplayTool,
  ToolGroupManager,
  BrushTool,
  StackScrollMouseWheelTool,
  segmentation,
  Enums: csToolsEnums,
  utilities,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack and Volume segmentation conversions',
  'In this demo, you see how the stack and volume segmentation conversions work. The purple background represents a StackViewport while the green background represents a VolumeViewport. You can start drawing using the brush tool and switch between stack and volume viewports'
);

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText = 'Left Click to use selected tool';

content.append(instructions);
// ============================= //

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_VIEWPORT';

const segmentationId = 'SegId';
const segmentationVolumeId = 'SegVolumeId';
const stackToolGroupId = 'stackToolGroupId';
const volumeToolGroupId = 'volumeToolGroupId';

let stackToolGroup;
let volumeToolGroup;

const orientationOptions = {
  axial: 'axial',
  sagittal: 'sagittal',
  coronal: 'coronal',
};

addButtonToToolbar({
  title: 'Switch StackViewport to VolumeViewport, and vice versa',
  onClick: async () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    const viewport = renderingEngine.getViewport(viewportId);

    let newViewport;
    if (viewport.type === ViewportType.STACK) {
      segmentation.state.removeSegmentationRepresentations(volumeToolGroupId);

      newViewport = await csUtils.convertStackToVolumeViewport({
        viewport: viewport as Types.IStackViewport,
        options: {
          background: <Types.Point3>[0, 0.4, 0],
          volumeId: `cornerstoneStreamingImageVolume:myVolume`,
        },
      });

      if (volumeToolGroup) {
        volumeToolGroup.addViewport(newViewport.id, renderingEngineId);
      }

      segmentation.convertStackToVolumeSegmentation({
        segmentationId,
        options: {
          toolGroupId: volumeToolGroupId,
          volumeId: `cornerstoneStreamingImageVolume:segMyVolume`,
        },
      });

      if (volumeToolGroup) {
        volumeToolGroup.addViewport(newViewport.id, renderingEngineId);

        volumeToolGroup.setToolDisabled('CircularBrush');
        volumeToolGroup.setToolActive('SphereBrush', {
          bindings: [
            {
              mouseButton: MouseBindings.Primary, // Left Click
            },
          ],
        });
      }
    } else {
      segmentation.state.removeSegmentationRepresentations(stackToolGroupId);

      newViewport = await csUtils.convertVolumeToStackViewport({
        viewport: viewport as Types.IVolumeViewport,
        options: {
          background: <Types.Point3>[0.4, 0, 0.4],
        },
      });

      segmentation.convertVolumeToStackSegmentation({
        segmentationId,
        options: {
          toolGroupId: stackToolGroupId,
        },
      });

      // Set the tool group on the viewport
      if (stackToolGroup) {
        stackToolGroup.addViewport(newViewport.id, renderingEngineId);

        stackToolGroup.setToolDisabled('SphereBrush');
        stackToolGroup.setToolActive('CircularBrush', {
          bindings: [
            {
              mouseButton: MouseBindings.Primary, // Left Click
            },
          ],
        });
      }
    }

    addOrientationDropdownIfVolumeViewport();
  },
});

function addOrientationDropdownIfVolumeViewport() {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId);

  // Check if the current viewport is a VolumeViewport
  if (viewport.type === ViewportType.ORTHOGRAPHIC) {
    addDropdownToToolbar({
      id: 'orientationDropdown',
      options: {
        values: ['axial', 'sagittal', 'coronal'],
        defaultValue: 'axial',
      },
      onSelectedValueChange: (selectedValue) => {
        // Get the rendering engine
        const renderingEngine = getRenderingEngine(renderingEngineId);

        // Get the volume viewport
        const viewport = <Types.IVolumeViewport>(
          renderingEngine.getViewport(viewportId)
        );

        switch (selectedValue) {
          case orientationOptions.axial:
            viewport.setOrientation(Enums.OrientationAxis.AXIAL);

            break;
          case orientationOptions.sagittal:
            viewport.setOrientation(Enums.OrientationAxis.SAGITTAL);

            break;
          case orientationOptions.coronal:
            viewport.setOrientation(Enums.OrientationAxis.CORONAL);
            break;
          default:
            throw new Error('undefined orientation option');
        }

        // TODO -> Maybe we should have a helper for this on the viewport
        // Set the new orientation
        // Reset the camera after the normal changes
        viewport.render();
      },
    });
  } else {
    const orientationDropdown = document.getElementById('orientationDropdown');
    if (orientationDropdown) {
      orientationDropdown.remove();
    }
  }
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(BrushTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  stackToolGroup = ToolGroupManager.createToolGroup(stackToolGroupId);
  volumeToolGroup = ToolGroupManager.createToolGroup(volumeToolGroupId);

  [stackToolGroup, volumeToolGroup].forEach((toolGroup) => {
    // Add the tools to the tool group
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(SegmentationDisplayTool.toolName);
    toolGroup.addToolInstance('CircularBrush', BrushTool.toolName, {
      activeStrategy: 'FILL_INSIDE_CIRCLE',
    });
    toolGroup.addToolInstance('SphereBrush', BrushTool.toolName, {
      activeStrategy: 'FILL_INSIDE_SPHERE',
    });
    // Set the initial state of the tools, here we set one tool active on left click.
    // This means left click will draw that tool.
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Secondary,
        },
      ],
    });
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
        },
      ],
    });
    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

    utilities.segmentation.setBrushSizeForToolGroup(
      toolGroup.id,
      50,
      BrushTool.toolName
    );
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  // imageIds = imageIds.slice(0, 4);

  await _startFromStack(imageIds, renderingEngine);
  // await _startFromVolume(renderingEngine, imageIds);
}

run();

async function _startFromVolume(
  renderingEngine: RenderingEngine,
  imageIds: string[]
) {
  volumeToolGroup.setToolActive('SphereBrush', {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: <Types.Point3>[0, 0.4, 0],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  volumeToolGroup.addViewport(viewportId, renderingEngineId);

  // Define a stack containing a single image
  const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
  const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
  // Define a volume in memory
  const volume = await cornerstone.volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();
  await cornerstone.setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId]
  );

  renderingEngine.render();

  await cornerstone.volumeLoader.createAndCacheDerivedSegmentationVolume(
    volumeId,
    {
      volumeId: segmentationVolumeId,
    }
  );

  await segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationVolumeId,
        },
      },
    },
  ]);
  // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(volumeToolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
  utilities.segmentation.triggerSegmentationRender(volumeToolGroupId);
}

async function _startFromStack(
  imageIds: string[],
  renderingEngine: RenderingEngine
) {
  stackToolGroup.setToolActive('CircularBrush', {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  const { imageIds: segmentationImageIds } =
    await cornerstone.imageLoader.createAndCacheDerivedImages(imageIds);

  // Instantiate a rendering engine
  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.4, 0, 0.4],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  stackToolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Define a stack containing a single image
  const stack = imageIds;

  // It is really important to await here, since the segmentation
  // data later on depends on the stack being set on the viewport
  await viewport.setStack(stack, 0);

  utilities.stackContextPrefetch.enable(viewport.element);

  // Render the image
  renderingEngine.render();

  await segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIdReferenceMap: utilities.segmentation.createImageIdReferenceMap(
            imageIds,
            segmentationImageIds
          ),
        },
      },
    },
  ]);

  // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(stackToolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
  utilities.segmentation.triggerSegmentationRender(stackToolGroupId);
}
