import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngine,
  getShouldUseCPURendering,
  metaData,
  setUseCPURendering,
  utilities,
} from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import * as cornerstoneTools from '@cornerstonejs/tools';

import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
  addToggleButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import { prefetchMetadataInformation } from '../../../../utils/demo/helpers/convertMultiframeImageIds';

const {
  PanTool,
  WindowLevelTool,
  ZoomTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, VOILUTFunctionType } = Enums;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

// ======== Set up page ======== //
setTitleAndDescription(
  'VOI LUT Function and VOI LUT Sequence (local DICOM)',
  'Drop a local DICOM P10 file (or pick one) to inspect how its VOI is applied. ' +
    'Shows VOI LUT Function (0028,1056) - LINEAR, LINEAR_EXACT and SIGMOID - and, ' +
    'when the file carries a VOI LUT Sequence (0028,3010), lets you compare the ' +
    'sequence against a plain window.'
);

const renderingEngineId = 'VOI_LUT_RENDERING_ENGINE';
const viewportId = 'VOI_LUT_STACK';
const toolGroupId = 'VOI_LUT_TOOL_GROUP';

const content = document.getElementById('content');

const instructions = document.createElement('p');
instructions.innerText =
  'Left click drag: window level | Middle drag: pan | Right drag: zoom';
content.appendChild(instructions);

const form = document.createElement('form');
form.style.marginBottom = '10px';
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.dcm,application/dicom';
form.appendChild(fileInput);
content.appendChild(form);

const layout = document.createElement('div');
layout.style.display = 'flex';
layout.style.flexDirection = 'row';
content.appendChild(layout);

const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';
element.style.border = '1px dashed #999';
element.oncontextmenu = (e) => e.preventDefault();
layout.appendChild(element);

const info = document.createElement('div');
info.style.marginLeft = '20px';
info.style.fontFamily = 'monospace';
info.style.whiteSpace = 'pre';
info.innerText = 'Drop a DICOM file on the viewport, or use the file picker.';
layout.appendChild(info);

// ============================= //

let renderingEngine: RenderingEngine;
let viewport: Types.IStackViewport;
let currentImageId: string;
// Mirrors what the viewport tracks internally: asking for a VOI LUT Function is
// the opt out from the image's own VOI LUT Sequence
let voiLUTFunctionRequested = false;

/**
 * (Re)creates the stack viewport.
 */
function createViewport() {
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  });

  viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;

  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    viewportId,
    renderingEngineId
  );
}

/**
 * Renders everything that decides how the VOI is applied for the loaded image:
 * the window from the file, the VOI LUT Function, the VOI LUT Sequence (if any)
 * and what the viewport ended up using.
 */
function updateInfo() {
  if (!currentImageId) {
    return;
  }

  const voiLutModule = metaData.get('voiLutModule', currentImageId) || {};
  const properties = viewport.getProperties();
  // image.voiLUT is the normalized VOI LUT Sequence the loader attached
  const voiLUT = viewport.getCornerstoneImage()?.voiLUT;

  const lines = [
    `rendering            : ${
      getShouldUseCPURendering() ? 'CPU fallback' : 'GPU (vtk.js)'
    }`,
    `windowCenter (0028,1050): ${voiLutModule.windowCenter ?? '-'}`,
    `windowWidth  (0028,1051): ${voiLutModule.windowWidth ?? '-'}`,
    `VOILUTFunction (0028,1056): ${voiLutModule.voiLUTFunction ?? '(absent)'}`,
    `VOI LUT Sequence (0028,3010): ${
      voiLUT
        ? `${voiLUT.lut.length} entries, firstValueMapped ${
            voiLUT.firstValueMapped
          }, ${voiLUT.numBitsPerEntry ?? '?'} bits/entry`
        : '(absent)'
    }`,
    '',
    `viewport VOILUTFunction : ${properties.VOILUTFunction}`,
    `viewport voiRange       : ${
      properties.voiRange
        ? `${properties.voiRange.lower.toFixed(
            2
          )} .. ${properties.voiRange.upper.toFixed(2)}`
        : '-'
    }`,
    `voiRange source         : ${
      properties.isComputedVOI ? 'metadata / VOI LUT' : 'set explicitly'
    }`,
    `applied VOI             : ${
      voiLUT && !voiLUTFunctionRequested
        ? 'VOI LUT Sequence, stretched over voiRange'
        : `${properties.VOILUTFunction} over voiRange`
    }`,
  ];

  info.innerText = lines.join('\n');
}

async function loadAndViewImage(imageId: string) {
  currentImageId = imageId;
  voiLUTFunctionRequested = false;

  await prefetchMetadataInformation([imageId]);
  await viewport.setStack([imageId]);

  viewport.render();
  updateInfo();
}

async function reloadCurrentImage() {
  if (!currentImageId) {
    return;
  }

  await loadAndViewImage(currentImageId);
}

fileInput.addEventListener('change', (evt: Event) => {
  const file = (evt.target as HTMLInputElement).files?.[0];

  if (!file) {
    return;
  }

  void loadAndViewImage(
    cornerstoneDICOMImageLoader.wadouri.fileManager.add(file)
  );
});

element.addEventListener('dragover', (evt: DragEvent) => {
  evt.stopPropagation();
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'copy';
});

element.addEventListener('drop', (evt: DragEvent) => {
  evt.stopPropagation();
  evt.preventDefault();

  const file = evt.dataTransfer.files[0];

  if (!file) {
    return;
  }

  void loadAndViewImage(
    cornerstoneDICOMImageLoader.wadouri.fileManager.add(file)
  );
});

// Keyed by the DICOM defined term of VOI LUT Function (0028,1056)
const voiLUTFunctions = {
  LINEAR: VOILUTFunctionType.LINEAR,
  LINEAR_EXACT: VOILUTFunctionType.LINEAR_EXACT,
  SIGMOID: VOILUTFunctionType.SAMPLED_SIGMOID,
};

addDropdownToToolbar({
  labelText: 'VOI LUT Function: ',
  options: {
    values: Object.keys(voiLUTFunctions),
    defaultValue: 'LINEAR',
  },
  onSelectedValueChange: (key) => {
    voiLUTFunctionRequested = true;
    viewport.setProperties({
      VOILUTFunction: voiLUTFunctions[key as keyof typeof voiLUTFunctions],
    });
    viewport.render();
    updateInfo();
  },
});

addButtonToToolbar({
  title: 'Back to the VOI LUT Sequence',
  onClick: () => {
    // resetProperties drops the explicitly requested VOI LUT Function, which is
    // what opts back in to the file's own VOI LUT Sequence
    voiLUTFunctionRequested = false;
    viewport.resetProperties();
    viewport.render();
    updateInfo();
  },
});

addButtonToToolbar({
  title: "Use the file's window instead",
  onClick: () => {
    const voiLutModule = metaData.get('voiLutModule', currentImageId) || {};
    const windowWidth = Array.isArray(voiLutModule.windowWidth)
      ? voiLutModule.windowWidth[0]
      : voiLutModule.windowWidth;
    const windowCenter = Array.isArray(voiLutModule.windowCenter)
      ? voiLutModule.windowCenter[0]
      : voiLutModule.windowCenter;

    if (windowWidth === undefined || windowCenter === undefined) {
      info.innerText = 'This file has no Window Center/Width to fall back to.';

      return;
    }

    // Requesting a VOI LUT Function is the opt out from the VOI LUT Sequence;
    // an explicit range alone would only stretch the sequence's curve
    const voiLUTFunction =
      viewport.getProperties().VOILUTFunction ?? VOILUTFunctionType.LINEAR;
    const voiRange = utilities.windowLevel.toLowHighRange(
      Number(windowWidth),
      Number(windowCenter),
      voiLUTFunction
    );

    voiLUTFunctionRequested = true;
    viewport.setProperties({ VOILUTFunction: voiLUTFunction, voiRange });
    viewport.render();
    updateInfo();
  },
});

addToggleButtonToToolbar({
  title: 'Use CPU rendering',
  defaultToggle: false,
  onClick: (toggle) => {
    setUseCPURendering(toggle);

    // Rebuild the element so the engine re-registers the viewport for the new
    // pipeline. See createViewport.
    renderingEngine.disableElement(viewportId);
    createViewport();

    void reloadCurrentImage();
  },
});

/**
 * Runs the demo
 */
async function run() {
  await initDemo();

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  renderingEngine = new RenderingEngine(renderingEngineId);

  createViewport();

  element.addEventListener(Enums.Events.VOI_MODIFIED, updateInfo);
}

run();
