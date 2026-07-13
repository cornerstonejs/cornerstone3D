import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  eventTarget,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  get4DVolumeImageIds,
  setTitleAndDescription,
  addButtonToToolbar,
  addSliderToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';

const {
  PanTool,
  ZoomTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'PT_4D_VOLUME_GENERIC';
const toolGroupId = 'myToolGroupGeneric4D';
const dataId = 'dynamic-volume-next:pt';
const dimensionGroupSliderId = 'dimension-group-slider';

// Registering the display set with a volumeId that carries the dynamic
// loader scheme is what makes the GenericViewport mount this data as a
// StreamingDynamicImageVolume (4D) instead of a regular streaming volume.
const volumeLoaderScheme = 'cornerstoneStreamingDynamicImageVolume';
const volumeName = 'PT_4D_VOLUME_GENERIC_ID';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;

let volume: Types.IDynamicImageVolume;
let cineIntervalId: ReturnType<typeof setInterval> | null = null;

const description = [
  'Displays a 4D DICOM series (dimension groups) in a Planar GenericViewport.',
  'DataSet: PET 255 x 255 images / 40 dimension groups / 235 images each / 9,400 images total',
].join('\n');

setTitleAndDescription('Volume 4D GenericViewport', description);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

const eventDetailsElement = document.createElement('div');
eventDetailsElement.id = 'event-details';
eventDetailsElement.style.margin = '10px';
eventDetailsElement.style.padding = '10px';
eventDetailsElement.style.border = '1px solid #ccc';
eventDetailsElement.style.backgroundColor = '#f8f8f8';
eventDetailsElement.style.fontFamily = 'monospace';
eventDetailsElement.innerText =
  'Dimension group change events will appear here';

content.appendChild(eventDetailsElement);
// ============================= //

function getViewport(): PlanarViewport {
  return getRenderingEngine(renderingEngineId).getViewport(
    viewportId
  ) as PlanarViewport;
}

function setDimensionGroup(dimensionGroupNumber: number) {
  // Setting dimensionGroupNumber swaps the active scalar data on the volume,
  // invalidates its shared GPU texture and re-renders every viewport that
  // holds this volume - including GenericViewports.
  volume.dimensionGroupNumber = dimensionGroupNumber;
}

function stopCine() {
  if (cineIntervalId !== null) {
    clearInterval(cineIntervalId);
    cineIntervalId = null;
  }
}

addDropdownToToolbar({
  options: {
    values: [
      Enums.OrientationAxis.ACQUISITION,
      Enums.OrientationAxis.AXIAL,
      Enums.OrientationAxis.SAGITTAL,
      Enums.OrientationAxis.CORONAL,
    ],
    defaultValue: Enums.OrientationAxis.ACQUISITION,
  },
  onSelectedValueChange: (selectedValue) => {
    const viewport = getViewport();

    viewport.setOrientation(selectedValue as Enums.OrientationAxis);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Play / Stop',
  onClick: () => {
    if (cineIntervalId !== null) {
      stopCine();
      return;
    }

    cineIntervalId = setInterval(() => {
      // scroll(1) advances the dimension group and wraps around at the end
      volume.scroll(1);
    }, 200);
  },
});

function addDimensionGroupSlider() {
  addSliderToToolbar({
    id: dimensionGroupSliderId,
    title: 'Dimension Group Number',
    range: [1, volume.numDimensionGroups],
    defaultValue: 1,
    onSelectedValueChange: (value) => {
      stopCine();
      setDimensionGroup(Number(value));
    },
  });
}

function addDimensionGroupEventListener() {
  eventTarget.addEventListener(
    Enums.Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
    (event) => {
      const { dimensionGroupNumber, numDimensionGroups } = (
        event as CustomEvent<{
          dimensionGroupNumber: number;
          numDimensionGroups: number;
        }>
      ).detail;

      eventDetailsElement.innerText = JSON.stringify(
        {
          type: 'Dimension Group Changed',
          volumeId,
          dimensionGroupNumber,
          numDimensionGroups,
        },
        null,
        2
      );

      // Keep the slider in sync while CINE is playing
      const slider = document.getElementById(
        dimensionGroupSliderId
      ) as HTMLInputElement;

      if (slider) {
        slider.value = String(dimensionGroupNumber);
      }
    }
  );
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const seriesImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '2.25.79767489559005369769092179787138169587',
    SeriesInstanceUID: '2.25.87977716979310885152986847054790859463',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const imageIds = get4DVolumeImageIds(seriesImageIds);

  // Create the dynamic (4D) volume up front so the toolbar can be built from
  // its dimension group count and so the display set mounts against it.
  volume = (await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  })) as Types.IDynamicImageVolume;

  volume.load();

  addDimensionGroupSlider();
  addDimensionGroupEventListener();

  // Instantiate a rendering engine and create a Planar GenericViewport
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.ACQUISITION,
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  });

  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addViewport(viewportId, renderingEngineId);

  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Primary },
      { mouseButton: MouseBindings.Wheel },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });

  element.addEventListener('contextmenu', (e) => e.preventDefault());

  // Register the display set. The volumeId ties the display set to the
  // dynamic volume created above; the GenericViewport resolves it through
  // the volume render path.
  utilities.genericViewportDisplaySetMetadataProvider.add(dataId, {
    imageIds,
    kind: 'planar',
    volumeId,
  });

  await viewport.setDisplaySets({
    displaySetId: dataId,
    options: {
      orientation: Enums.OrientationAxis.ACQUISITION,
    },
  });

  viewport.render();
}

run();
