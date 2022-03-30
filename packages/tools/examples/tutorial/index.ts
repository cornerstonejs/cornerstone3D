import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
} from '../../../../utils/demo/helpers';

const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
    type: 'VOLUME',
  });

  /**
   * Copy-paste the code from tutorials below to try them locally.
   * You can run the tutorial after by running `yarn run example tutorial` when
   * you are at the root of the tools package directory.
   */
  const renderingEngineId = 'myRenderingEngine';
  const viewportId = 'CT_SAGITTAL_STACK';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInput = {
    viewportId,
    element,
    type: ViewportType.STACK,
  };

  renderingEngine.enableElement(viewportInput);

  const viewport = renderingEngine.getViewport(
    viewportInput.viewportId
  ) as Types.IStackViewport;

  viewport.setStack(imageIds, 60);
}

run();
