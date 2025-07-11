import type { Types } from '@cornerstonejs/core';
import type { Types as csToolTypes } from '@cornerstonejs/tools';
import {
  Enums,
  getRenderingEngine,
  RenderingEngine,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
  addManipulationBindings,
  contourSegmentationToolBindings,
} from '../../../../utils/demo/helpers';
const {
  add,
  subtract,
  intersect,
  xor,
  LogicalOperation,
  copy,
  deleteOperation,
} = cornerstoneTools.utilities.contourSegmentation;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SplineContourSegmentationTool,

  PlanarFreehandContourSegmentationTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;
const { ViewportType } = Enums;

// Define a unique id for the volume
const toolGroupId = 'STACK_TOOLGROUP_ID';

// Define a unique id for the volume
const renderingEngineId = 'myRenderingEngine';
const viewportIds = ['CT_STACK'];
const segmentationId = `SEGMENTATION_ID`;
let selectedOperation = LogicalOperation.Union;

// ======== Set up page ======== //

setTitleAndDescription(
  'Logical operations',
  'Here we demonstrate how to use logical operations to combine two segments in a new segment'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const elements = [element1];

elements.forEach((element) => {
  element.style.width = size;
  element.style.height = size;

  // Disable right click context menu so we can have right click tool
  element.oncontextmenu = (e) => e.preventDefault();

  viewportGrid.appendChild(element);
});

content.appendChild(viewportGrid);

// ============================= //

const cancelDrawingEventListener = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

elements.forEach((element) => {
  element.addEventListener(
    csToolsEnums.Events.KEY_DOWN,
    cancelDrawingEventListener
  );
});

const operationNames = [
  'Add',
  'Subtract',
  'Intersect',
  'XOR',
  'Copy',
  'Delete',
];

const Splines = {
  CatmullRomSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.CatmullRom,
  },
  LinearSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.Linear,
  },
  BSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.BSpline,
  },
};

const SplineToolNames = Object.keys(Splines);
const contourToolsNames = [
  ...SplineToolNames,
  PlanarFreehandContourSegmentationTool.toolName,
];
let selectedToolName = contourToolsNames[0];

const segmentIndices = [1, 2, 3, 4, 5];
let firstSegmentIndex = segmentIndices[0];
let secondSegmentIndex = segmentIndices[1];
let outputSegmentIndex = segmentIndices[0];

addDropdownToToolbar({
  labelText: 'Drawing segment',
  options: { values: segmentIndices, defaultValue: segmentIndices[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const segmentIndex = Number(nameAsStringOrNumber);
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      segmentIndex
    );
  },
});

addDropdownToToolbar({
  options: { values: contourToolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: contourSegmentationToolBindings,
    });

    selectedToolName = <string>newSelectedToolName;
  },
});

addDropdownToToolbar({
  labelText: 'First segment',
  options: { values: segmentIndices, defaultValue: segmentIndices[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    firstSegmentIndex = Number(nameAsStringOrNumber);
  },
});

addDropdownToToolbar({
  options: { values: operationNames, defaultValue: selectedToolName },
  onSelectedValueChange: (selectedOperationName) => {
    const operationName = String(selectedOperationName);
    switch (operationName) {
      case 'Add':
        selectedOperation = LogicalOperation.Union;
        break;
      case 'Subtract':
        selectedOperation = LogicalOperation.Subtract;
        break;
      case 'Intersect':
        selectedOperation = LogicalOperation.Intersect;
        break;
      case 'XOR':
        selectedOperation = LogicalOperation.XOR;
        break;
      case 'Copy':
        selectedOperation = LogicalOperation.Copy;
        break;
      case 'Delete':
        selectedOperation = LogicalOperation.Delete;
        break;
    }
    // Enable/disable the second segment dropdown based on operation
    const secondDropdown = document.getElementById(
      'secondSegmentIndex'
    ) as HTMLSelectElement | null;
    if (secondDropdown) {
      if (
        selectedOperation === LogicalOperation.Copy ||
        selectedOperation === LogicalOperation.Delete
      ) {
        secondDropdown.disabled = true;
      } else {
        secondDropdown.disabled = false;
      }
    }

    // Enable/disable the output segment dropdown based on operation
    const outputDropDown = document.getElementById(
      'outputSegmentIndex'
    ) as HTMLSelectElement | null;
    if (outputDropDown) {
      if (selectedOperation === LogicalOperation.Delete) {
        outputDropDown.disabled = true;
      } else {
        outputDropDown.disabled = false;
      }
    }
  },
});

addDropdownToToolbar({
  id: 'secondSegmentIndex',
  labelText: 'Second segment',
  options: { values: segmentIndices, defaultValue: segmentIndices[1] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    secondSegmentIndex = Number(nameAsStringOrNumber);
  },
});

addDropdownToToolbar({
  id: 'outputSegmentIndex',
  labelText: '= Output segment',
  options: { values: segmentIndices, defaultValue: segmentIndices[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    outputSegmentIndex = Number(nameAsStringOrNumber);
  },
});

addButtonToToolbar({
  title: 'Apply operation',
  onClick: function () {
    performLogicalOperation(selectedOperation, false);
  },
});

function performLogicalOperation(
  operation: csToolTypes.LogicalOperation = LogicalOperation.Union,
  createNew: boolean = true
) {
  const activeSeg = segmentation.getActiveSegmentation(viewportIds[0]);

  if (!activeSeg) {
    console.log('No active segmentation detected');
    return;
  }

  if (!activeSeg.representationData.Contour) {
    console.log('No contour representation found');
    return;
  }

  const representationData = activeSeg.representationData.Contour;
  const { annotationUIDsMap } = representationData;

  if (annotationUIDsMap) {
    const segmentIndexes = Array.from(annotationUIDsMap.keys());
    const operatorOptions = {
      segmentationId: activeSeg.segmentationId,
      segmentIndex: outputSegmentIndex,
      color: 'rgb(50, 130, 162)',
    };

    if (segmentIndexes.length > 0) {
      if (operation === LogicalOperation.Copy) {
        copy(
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: firstSegmentIndex,
          },
          operatorOptions
        );
      } else if (operation === LogicalOperation.Delete) {
        deleteOperation({
          segmentationId: activeSeg.segmentationId,
          segmentIndex: firstSegmentIndex,
        });
      }
    }
    if (segmentIndexes.length > 1) {
      if (operation === LogicalOperation.Union) {
        add(
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: firstSegmentIndex,
          },
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: secondSegmentIndex,
          },
          operatorOptions
        );
      } else if (operation === LogicalOperation.Subtract) {
        subtract(
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: firstSegmentIndex,
          },
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: secondSegmentIndex,
          },
          operatorOptions
        );
      } else if (operation === LogicalOperation.Intersect) {
        intersect(
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: firstSegmentIndex,
          },
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: secondSegmentIndex,
          },
          operatorOptions
        );
      } else if (operation === LogicalOperation.XOR) {
        xor(
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: firstSegmentIndex,
          },
          {
            segmentationId: activeSeg.segmentationId,
            segmentIndex: secondSegmentIndex,
          },
          operatorOptions
        );
      }
    }
  }
  const renderingEngine = getRenderingEngine(renderingEngineId);
  renderingEngine.render();
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SplineContourSegmentationTool);
  cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  toolGroup.addTool(SplineContourSegmentationTool.toolName);
  toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);

  toolGroup.addToolInstance(
    'CatmullRomSplineROI',
    SplineContourSegmentationTool.toolName,
    {
      spline: {
        type: SplineContourSegmentationTool.SplineTypes.CatmullRom,
      },
    }
  );

  toolGroup.addToolInstance(
    'LinearSplineROI',
    SplineContourSegmentationTool.toolName,
    {
      spline: {
        type: SplineContourSegmentationTool.SplineTypes.Linear,
      },
    }
  );

  toolGroup.addToolInstance(
    'BSplineROI',
    SplineContourSegmentationTool.toolName,
    {
      spline: {
        type: SplineContourSegmentationTool.SplineTypes.BSpline,
      },
    }
  );

  toolGroup.setToolActive(contourToolsNames[0], {
    bindings: contourSegmentationToolBindings,
  });

  // Spline curves may be converted into freehand contours when they overlaps (append/remove)
  toolGroup.setToolPassive(PlanarFreehandContourSegmentationTool.toolName, {
    removeAllBindings: contourSegmentationToolBindings,
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a stack containing a single image
  const smallStackImageIds = [stackImageIds[0], stackImageIds[1]];

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack and a volume viewport
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: elements[0],
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Get the viewports that were just created
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );

  // Set the stack on the viewport
  stackViewport.setStack(smallStackImageIds);

  // Render the image
  renderingEngine.renderViewports(viewportIds);

  // Render the image
  renderingEngine.render();

  // Add a segmentation that will contains the contour annotations
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Create a segmentation representation associated to the viewportId
  await segmentation.addSegmentationRepresentations(viewportIds[0], [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);
}

run();
