import { RenderingEngine, Types, Enums, cache } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

import cornerstoneDicomImageLoader from '@cornerstonejs/dicom-image-loader';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Progressive Stack',
  'Displays a single DICOM image in a Stack viewport after clicking the load button.'
);

const content = document.getElementById('content');
const { cornerstone } = window;

const instructions = document.createElement('p');
instructions.innerText = 'Click on a button to perform the given load type';
content.appendChild(instructions);

const loaders = document.createElement('div');
content.appendChild(loaders);

const timingInfo = document.createElement('div');
timingInfo.innerText = 'Timing Info Here';
content.appendChild(timingInfo);

const devicePixelRatio = window.devicePixelRatio || 1;
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = `${3036 / devicePixelRatio}px`;
element.style.height = `${3036 / devicePixelRatio}px`;

content.appendChild(element);

// ============================= //

async function newImageFunction(evt) {
  const { image } = evt.detail;
  const { complete, decodeTimeInMS, loadTimeInMS } = image;
  if (complete) {
    element.removeEventListener(
      cornerstone.EVENTS.STACK_NEW_IMAGE,
      newImageFunction
    );
  }
  const completeText = complete ? 'final' : 'partial';
  console.log('new image', image);
  timingInfo.innerHTML += `<p>Render ${completeText} took ${loadTimeInMS} ms to load and ${decodeTimeInMS} to decode ${
    loadTimeInMS + decodeTimeInMS
  } total</p>`;
}

async function showStack(stack: string[], viewport, config) {
  cornerstoneDicomImageLoader.configure(config);
  cache.purgeCache();
  console.time('imageLoad');
  timingInfo.innerHTML = `<p>Loading ${stack[0]}</p>`;
  element.addEventListener(
    cornerstone.EVENTS.STACK_NEW_IMAGE,
    newImageFunction
  );
  const start = Date.now();
  // Set the stack on the viewport
  await viewport.setStack(stack);

  // Render the image
  viewport.render();
  console.timeEnd('imageLoad');
  const end = Date.now();
  const { transferSyntaxUID } = cornerstone.metaData.get(
    'transferSyntax',
    stack[0]
  );
  timingInfo.innerHTML += `<p>Stack render took ${
    end - start
  } using ${transferSyntaxUID}</p>`;
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
 * mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jls "/dicom/DE Images for Rad"
 * mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jlsThumbnail --alternate-thumbnail "/dicom/DE Images for Rad"
 * ```
 *
 * HTJ2K and HTJ2K thumbnail - lossless:
 * ```bash
 * mkdicomweb create -t jhc --recompress true --alternate jhcLossless --alternate-name htj2k "/dicom/DE Images for Rad"
 * mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name htj2kThumbnail --alternate-thumbnail "/dicom/DE Images for Rad"
 * ```
 */
const configJLS = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      framesPath: '/jls/',
    },
    'default-final': {
      framesPath: '/jls/',
    },
  },
};

const configJLSMixed = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
    default: {
      framesPath: '/jls/',
    },
  },
};

const configJLSThumbnail = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      // isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
    'default-final': {
      // isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
  },
};

const configHtj2k = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      framesPath: '/htj2k/',
      streaming: true,
    },
    '3.2.840.10008.1.2.4.96-lossy': {
      streaming: true,
      framesPath: '/htj2k',
    },
    'default-lossy': {
      framesPath: '/htj2k/',
    },
    'default-final': {
      framesPath: '/htj2k/',
    },
  },
};

const configHtj2kByteRange = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      framesPath: '/htj2k/',
      streaming: true,
    },
    'default-lossy': {
      isLossy: true,
      streaming: false,
      framesPath: '/htj2k/',
      initialBytes: 32768,
      decodeLevel: 4,
    },
    default: {
      framesPath: '/htj2k/',
    },
  },
};

const configHtj2kLossy = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      isLossy: true,
      framesPath: '/lossy/',
      initialBytes: 65536,
    },
    default: {
      framesPath: '/lossy/',
    },
  },
};

const configHtj2kMixed = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      isLossy: true,
      framesPath: '/lossy/',
      initialBytes: 16384,
      decodeLevel: 4,
    },
    default: {
      framesPath: '/htj2k/',
    },
  },
};

const configHtj2kThumbnail = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      isLossy: true,
      framesPath: '/htj2kThumbnail/',
      decodeLevel: 4,
      initialBytes: 16384,
    },
    default: {
      framesPath: '/htj2k/',
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
    wadoRsRoot: 'http://localhost:5000/dicomweb',
  });

  const imageIdsCt = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
    wadoRsRoot: 'http://localhost:5000/dicomweb',
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

  const createButton = (text, imageIds, config) => {
    const button = document.createElement('button');
    button.innerText = text;
    button.id = text;
    button.onclick = showStack.bind(null, imageIds, viewport, config);
    loaders.appendChild(button);
    return button;
  };

  createButton('JLS', imageIds, configJLS);
  createButton('JLS Thumbnail', imageIds, configJLSThumbnail);
  createButton('JLS Mixed', imageIds, configJLSMixed);

  createButton('HTJ2K', imageIds, configHtj2k);
  createButton('HTJ2K Lossy', imageIds, configHtj2kLossy);
  createButton('HTJ2K Thumbnail', imageIds, configHtj2kThumbnail);
  createButton('HTJ2K Range/Final', imageIds, configHtj2kByteRange);
  createButton('HTJ2K Lossy/Final', imageIds, configHtj2kMixed);

  createButton('CT JLS', imageIdsCt, configJLSMixed);
  createButton('CT HTJ2K Lossy/Final', imageIdsCt, configHtj2kMixed);
  createButton('CT HTJ2K Thumbnail', imageIdsCt, configHtj2kThumbnail);
}

run();
