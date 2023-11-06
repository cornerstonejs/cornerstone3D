import {
  RenderingEngine,
  Types,
  Enums,
  cache,
  setUseCPURendering,
  ProgressiveRetrieveImages,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

const { imageRetrieveMetadataProvider } = utilities;
const { singleRetrieveStages, sequentialRetrieveStages } =
  ProgressiveRetrieveImages;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, ImageQualityStatus } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'HTJ2K Basic Display - Stack',
  'Displays a single DICOM image in a Stack viewport after clicking the load button.'
);

const content = document.getElementById('content');

const instructions = document.createElement('p');
instructions.innerText = 'Click on a button to perform the given load type';
content.appendChild(instructions);

const loaders = document.createElement('div');
content.appendChild(loaders);

const timingInfo = document.createElement('div');
timingInfo.style.width = '45em';
timingInfo.style.height = '5em';
timingInfo.style.float = 'left';
timingInfo.innerText = 'Timing Info Here';
content.appendChild(timingInfo);

const devicePixelRatio = window.devicePixelRatio || 1;
const element = document.createElement('div');
element.id = 'cornerstone-element';
// Use devicePixelRatio here so that the window size fits all pixels, but not
// larger than that.
element.style.width = `${3036 / devicePixelRatio}px`;
element.style.height = `${3036 / devicePixelRatio}px`;
element.style.clear = 'both';
content.appendChild(element);

// ============================= //

const statusNames = {
  [ImageQualityStatus.FULL_RESOLUTION]: 'full resolution',
  [ImageQualityStatus.LOSSY]: 'lossy',
  [ImageQualityStatus.SUBRESOLUTION]: 'sub-resolution',
};

let startTime = Date.now();

async function newImageFunction(evt) {
  const { image } = evt.detail;
  const {
    imageQualityStatus: status,
    decodeTimeInMS,
    loadTimeInMS,
    transferSyntaxUID,
  } = image;
  const complete = status === ImageQualityStatus.FULL_RESOLUTION;
  if (complete) {
    element.removeEventListener(
      cornerstone.EVENTS.STACK_NEW_IMAGE,
      newImageFunction
    );
  }
  const completeText = statusNames[status] || `other ${status}`;
  const totalTime = Date.now() - startTime;
  timingInfo.innerHTML += `<p style="margin:0">Render ${completeText} of ${transferSyntaxUID} took ${loadTimeInMS} ms to load and ${decodeTimeInMS} to decode ${totalTime} total</p>`;
}

async function showStack(
  stack: string[],
  viewport,
  retrieveConfiguration,
  name: string
) {
  cache.purgeCache();
  imageRetrieveMetadataProvider.clear();
  if (retrieveConfiguration) {
    imageRetrieveMetadataProvider.add('stack', retrieveConfiguration);
  }
  timingInfo.innerHTML = `<p id="loading" style="margin:0">Loading ${name}</p>`;
  startTime = Date.now();
  element.addEventListener(
    cornerstone.EVENTS.STACK_NEW_IMAGE,
    newImageFunction
  );
  const start = Date.now();
  // Set the stack on the viewport
  await viewport.setStack(stack, 0, retrieveConfiguration);

  // Render the image
  viewport.render();
  const end = Date.now();
  const { transferSyntaxUID } = cornerstone.metaData.get(
    'transferSyntax',
    stack[0]
  );
  document.getElementById('loading').innerText = `Stack render took ${
    end - start
  } using ${transferSyntaxUID}`;
}

/**
 * Generate the various configurations by using the options on static DICOMweb:
 * Base lossy/full thumbnail configuration for HTJ2K:
 * ```
 * mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name lossy "/dicom/DE Images for Rad"
 * ```
 *
 * JLS and JLS thumbnails:
 * ```bash
 * mkdicomweb create -t jhc --recompress true --alternate jlsLossless --alternate-name jls "/dicom/DE Images for Rad"
 * mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jlsThumbnail --alternate-thumbnail "/dicom/DE Images for Rad"
 * ```
 *
 * HTJ2K and HTJ2K thumbnail - lossless:
 * ```bash
 * mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name htj2kThumbnail --alternate-thumbnail "/dicom/DE Images for Rad"
 * ```
 */
const jlsRetrieveOptions = {
  ...singleRetrieveStages,
  retrieveOptions: {
    default: {
      framesPath: '/jls/',
    },
  },
};

const jlsThumbnailOptions = {
  ...singleRetrieveStages,
  retrieveOptions: {
    default: {
      framesPath: '/jlsThumbnail/',
    },
  },
};

const jlsMixedOptions = {
  ...sequentialRetrieveStages,
  retrieveOptions: {
    singleFast: {
      status: ImageQualityStatus.SUBRESOLUTION,
      framesPath: '/jlsThumbnail/',
    },
    singleFinal: {
      framesPath: '/jls/',
    },
  },
};

const htj2kProgressiveOptions = {
  ...singleRetrieveStages,
  retrieveOptions: {
    single: {
      streaming: true,
      streamingDecode: true,
    },
  },
};

const htj2kLossyOptions = {
  ...sequentialRetrieveStages,
  retrieveOptions: {
    singleFast: {
      status: ImageQualityStatus.LOSSY,
      framesPath: '/lossy/',
      streaming: true,
      streamingDecode: true,
    },
  },
};

const htj2kMixedOptions = {
  ...sequentialRetrieveStages,
  retrieveOptions: {
    singleFinal: {
      range: 1,
    },
    singleFast: {
      range: 0,
      decodeLevel: 3,
    },
  },
};

const htj2kThumbnailOptions = {
  ...sequentialRetrieveStages,
  retrieveOptions: {
    singleFinal: {},
    singleFast: {
      status: ImageQualityStatus.SUBRESOLUTION,
      framesPath: '/htj2kThumbnail/',
      streaming: true,
      streamingDecode: true,
    },
  },
};

const isLocal = false;

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.9590.100.1.2.19841440611855834937505752510708699165',
    SeriesInstanceUID:
      '1.3.6.1.4.1.9590.100.1.2.160160590111755920740089886004263812825',
    wadoRsRoot: isLocal
      ? 'http://localhost:5000/dicomweb'
      : 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  const imageIdsCt = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
    wadoRsRoot: isLocal
      ? 'http://localhost:5000/dicomweb'
      : 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'stackViewport';
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  const createButton = (text, action) => {
    const button = document.createElement('button');
    button.innerText = text;
    button.id = text;
    button.onclick = action;
    loaders.appendChild(button);
    return button;
  };

  const loadButton = (text, imageIds, retrieveConfiguration) => {
    return createButton(
      text,
      showStack.bind(null, imageIds, viewport, retrieveConfiguration, text)
    );
  };

  loadButton('HTJ2K Non Progressive', imageIds, undefined);
  loadButton('HTJ2K Progressive', imageIds, htj2kProgressiveOptions);
}

run();
