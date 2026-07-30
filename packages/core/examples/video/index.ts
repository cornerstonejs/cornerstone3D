import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
  createDisplaySets,
  getLocalUrl,
  getViewportTypeForDisplaySet,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { Events } = Enums;
// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoViewport';

// ======== Set up page ======== //
setTitleAndDescription(
  'Video Viewport API',
  'Demonstrates how to interact with a Video viewport.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, (_) => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the stack viewport
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IStackViewport;

  if (!viewport) {
    return;
  }

  const { flipHorizontal, flipVertical } = viewport.getCamera();
  const { rotation } = viewport.getViewPresentation();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});

addButtonToToolbar({
  title: 'Play',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IVideoViewport;

    // Set a range to highlight bones
    viewport.play();
  },
});

addButtonToToolbar({
  title: 'Pause',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IVideoViewport;

    // Set a range to highlight bones
    viewport.pause();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Fetch the series metadata and split it into display sets using the default
  // split rules.
  const displaySets = await createDisplaySets({
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  if (!displaySets.length) {
    throw new Error('No display set found in series');
  }

  // This is a mixed series (single-frame secondary captures + one multi-frame
  // video), so pick the display set whose split rule flagged it as video rather
  // than blindly taking the first one.
  const displaySet = displaySets.find(
    (ds) => getViewportTypeForDisplaySet(ds) === Enums.ViewportType.VIDEO
  );

  // This example only supports video series, so bail clearly if the series did
  // not contain a video display set.
  if (!displaySet) {
    const resolved = displaySets
      .map((ds) => ds.preferredViewportType)
      .join(', ');
    throw new Error(
      `No video display set found in series (resolved types: ${resolved}). ` +
        'This example only supports video series.'
    );
  }

  const viewportType = Enums.ViewportType.VIDEO;

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewport using the display set's preferred viewport type.
  const viewportInput = {
    viewportId,
    type: viewportType,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the viewport that was created
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IVideoViewport;

  // Drive the viewport from the display set (displaySetId is the source imageId).
  await viewport.setDisplaySets({
    displaySetId: displaySet.instances[0].imageId,
  });

  // Set the VOI of the stack
  // viewport.setProperties({ voiRange: ctVoiRange });

  // Render the image
  // viewport.play();
}

run();
