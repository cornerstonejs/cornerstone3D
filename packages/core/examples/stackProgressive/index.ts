import {
  Enums,
  cache,
  ProgressiveRetrieveImages,
  utilities,
  RenderingEngine,
  metaData,
  type Types,
  setUseCPURendering,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  getLocalUrl,
} from '../../../../utils/demo/helpers';

const { imageRetrieveMetadataProvider } = utilities;
const { sequentialRetrieveStages } = ProgressiveRetrieveImages;
const { Events } = Enums;
// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, ImageQualityStatus } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Progressive Stack',
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
timingInfo.style.height = '10em';
timingInfo.style.float = 'left';
timingInfo.innerText = 'Timing Info Here';
content.appendChild(timingInfo);

const itemInfo = document.createElement('div');
itemInfo.style.width = '25em';
itemInfo.style.height = '10em';
itemInfo.style.float = 'left';
content.appendChild(itemInfo);
itemInfo.innerHTML = `
<ul>
<li>JLS Thumbnail - small JLS thumbnails only</li>
<li>JLS Mixed - thumbnail first, then full</li>
<li>HTJ2K - streaming load</li>
<li>HTJ2K - lossy byte range then lossy full</li>
<li>Bytes - full resolution 64k bytes, then full final</li>
</ul>
`;

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
    element.removeEventListener(Events.STACK_NEW_IMAGE, newImageFunction);
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
  element.addEventListener(Events.STACK_NEW_IMAGE, newImageFunction);
  const start = Date.now();
  // Set the stack on the viewport
  await viewport.setStack(stack, 0, retrieveConfiguration);

  // Render the image
  viewport.render();
  const end = Date.now();
  const { transferSyntaxUID } = metaData.get('transferSyntax', stack[0]);
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
  retrieveOptions: {
    default: {
      framesPath: '/jls/',
    },
  },
};

const jlsThumbnailOptions = {
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
      imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
      framesPath: '/jlsThumbnail/',
    },
    singleFinal: {
      framesPath: '/jls/',
    },
  },
};

const htj2kProgressiveOptions = {
  retrieveOptions: {
    single: {
      streaming: true,
      decodeLevel: 1,
    },
  },
};

const htj2kLossyOptions = {
  ...sequentialRetrieveStages,
  retrieveOptions: {
    singleFast: {
      imageQualityStatus: ImageQualityStatus.LOSSY,
      framesPath: '/lossy/',
      streaming: true,
    },
  },
};

const htj2kMixedOptions = {
  stages: [
    {
      id: 'lossySequential',
      retrieveType: 'singleFast',
    },
    {
      id: 'lossySequentialFailure',
      retrieveType: 'singleFastFailure',
    },
    {
      id: 'lossyMiddle',
      retrieveType: 'singleMiddle',
    },
    {
      id: 'lossyMiddleFailure',
      retrieveType: 'singleMiddleFailure',
    },
    {
      id: 'finalSequential',
      retrieveType: 'singleFinal',
    },
  ],
  retrieveOptions: {
    singleFast: {
      decodeLevel: 2,
      chunkSize: 128 * 1024,
      rangeIndex: 0,
    },
    // This is a fallback phase if decodeLevel 2 fails, then try at 3
    singleFastFailure: {
      decodeLevel: 3,
      rangeIndex: 0,
    },
    // Note how the rangeIndex increases significantly to get much more data
    singleMiddle: {
      decodeLevel: 0,
      rangeIndex: 10,
    },
    singleMiddleFailure: {
      decodeLevel: 1,
      rangeIndex: 10,
    },
    singleFinal: {
      // Just do the final rangeIndex retrieve
      rangeIndex: -1,
    },
  },
};

const htj2kThumbnailOptions = {
  ...sequentialRetrieveStages,
  retrieveOptions: {
    singleFinal: {},
    singleFast: {
      imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
      framesPath: '/htj2kThumbnail/',
      streaming: true,
    },
  },
};

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
    wadoRsRoot:
      getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  const imageIdsCt = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
    wadoRsRoot:
      getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
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

  loadButton('JLS', imageIds, jlsRetrieveOptions);

  loadButton('JLS Thumbnail', imageIds, jlsThumbnailOptions);
  loadButton('JLS Mixed', imageIds, jlsMixedOptions);

  loadButton('HTJ2K Non Progressive', imageIds, undefined);
  loadButton('HTJ2K', imageIds, htj2kProgressiveOptions);
  loadButton('HTJ2K Lossy', imageIds, htj2kLossyOptions);
  loadButton('HTJ2K Thumbnail', imageIds, htj2kThumbnailOptions);
  loadButton('HTJ2K Bytes', imageIds, htj2kMixedOptions);

  loadButton('CT JLS Mixed', imageIdsCt, jlsMixedOptions);
  loadButton('CT HTJ2K Bytes', imageIdsCt, htj2kMixedOptions);

  createButton('Set CPU', (onclick) => {
    const button = document.getElementById('Set CPU');
    const cpuValue = button.innerText === 'Set CPU';
    setUseCPURendering(cpuValue);
    viewport.setUseCPURendering(cpuValue);
    button.innerText = cpuValue ? 'Set GPU' : 'Set CPU';
  });
}

run();
