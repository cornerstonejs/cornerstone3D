import {
  Enums,
  RenderingEngine,
  Types,
  eventTarget,
  imageLoader,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import ort from 'onnxruntime-web/webgpu';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
  addManipulationBindings,
  getLocalUrl,
  addSegmentIndexDropdown,
  labelmapTools,
  annotationTools,
} from '../../../../utils/demo/helpers';
import { fillVolumeSegmentationWithMockData } from '../../../../utils/test/testUtils';

import { filterAnnotationsForDisplay } from '../../src/utilities/planar';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  annotation,
  utilities: cstUtils,
} = cornerstoneTools;

const { triggerSegmentationDataModified } =
  segmentation.triggerSegmentationEvents;

const { ViewportType, Events } = Enums;
const { Events: toolsEvents, KeyboardBindings, MouseBindings } = csToolsEnums;
const { state: annotationState } = annotation;
const { style: toolStyle } = cornerstoneTools.annotation.config;
const volumeId = 'volumeId';
const volumeSegLabelmapId = 'segVolumeId';

// Define various constants for the tool definition
const toolGroupId = 'DEFAULT_TOOLGROUP_ID';
let tool;

const segmentationId = `SEGMENTATION_ID`;

let currentImage;

/** Store other sessions to be used for next images. */
const sessions = [];

const toolMap = new Map(annotationTools);
const defaultTool = 'MarkerInclude';
toolMap.set(defaultTool, {
  baseTool: cornerstoneTools.ProbeTool.toolName,
  configuration: {
    getTextLines: () => null,
  },
});
toolStyle.getDefaultToolStyles()[defaultTool] = { color: 'blue' };

const excludeTool = 'MarkerExclude';
toolMap.set(excludeTool, {
  baseTool: cornerstoneTools.ProbeTool.toolName,
  bindings: [{ mouseButton: MouseBindings.Secondary }],
  configuration: {
    getTextLines: () => null,
  },
});
toolStyle.getDefaultToolStyles()[excludeTool] = {
  color: 'pink',
  colorSelected: 'red',
};

for (const [key, value] of labelmapTools.toolMap) {
  toolMap.set(key, value);
}

toolMap.set(cornerstoneTools.ZoomTool.toolName, {
  bindings: [
    {
      mouseButton: MouseBindings.Auxiliary,
      modifierKey: KeyboardBindings.Ctrl,
    },
  ],
});

// ======== Set up page ======== //

setTitleAndDescription(
  'Segmentation AI',
  'Here we demonstrate how to use various predictive AI/ML techniques to aid your segmentation'
);

// the image size on canvas
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;

// the image size supported by the model
const MODEL_WIDTH = 1024;
const MODEL_HEIGHT = 1024;

const MODELS = {
  sam_b: [
    {
      name: 'sam-b-encoder',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b_01ec64.encoder-fp16.onnx',
      size: 180,
      key: 'encoder',
    },
    {
      name: 'sam-b-decoder',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b_01ec64.decoder.onnx',
      size: 17,
      key: 'decoder',
    },
  ],
  sam_b_int8: [
    {
      name: 'sam-b-encoder-int8',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b-encoder-int8.onnx',
      size: 108,
      key: 'encoder',
    },
    {
      name: 'sam-b-decoder-int8',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b-decoder-int8.onnx',
      size: 5,
      key: 'decoder',
    },
  ],
};

const config = getConfig();

ort.env.wasm.wasmPaths = 'dist/';
ort.env.wasm.numThreads = config.threads;
// ort.env.wasm.proxy = config.provider == "wasm";

const canvas = document.createElement('canvas');
canvas.oncontextmenu = () => false;
const canvasMask = document.createElement('canvas');
const originalImage = document.createElement('img');
originalImage.id = 'original-image';
let decoder_latency;

let points = [];
let labels = [];
let imageImageData;
let isClicked = false;
let maskImageData;

function log(i) {
  document.getElementById('status').innerText += `\n${i}`;
}

/**
 * create config from url
 */
function getConfig() {
  const query = window.location.search.substring(1);
  const config = {
    model: 'sam_b',
    provider: 'webgpu',
    device: 'gpu',
    threads: 4,
    local: null,
    isSlimSam: false,
  };
  const vars = query.split('&');
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=');
    if (pair[0] in config) {
      config[pair[0]] = decodeURIComponent(pair[1]);
    } else if (pair[0].length > 0) {
      throw new Error('unknown argument: ' + pair[0]);
    }
  }
  config.threads = parseInt(String(config.threads));
  config.local = parseInt(config.local);
  return config;
}

/**
 * clone tensor
 */
function cloneTensor(t) {
  return new ort.Tensor(t.type, Float32Array.from(t.data), t.dims);
}

/*
 * create feed for the original facebook model
 */
function feedForSam(emb, points, labels) {
  const maskInput = new ort.Tensor(
    new Float32Array(256 * 256),
    [1, 1, 256, 256]
  );
  const hasMask = new ort.Tensor(new Float32Array([0]), [1]);
  const originalImageSize = new ort.Tensor(
    new Float32Array([MODEL_HEIGHT, MODEL_WIDTH]),
    [2]
  );
  const pointCoords = new ort.Tensor(new Float32Array(points), [
    1,
    points.length / 2,
    2,
  ]);
  const pointLabels = new ort.Tensor(new Float32Array(labels), [
    1,
    labels.length,
  ]);

  return {
    image_embeddings: cloneTensor(emb.image_embeddings),
    point_coords: pointCoords,
    point_labels: pointLabels,
    mask_input: maskInput,
    has_mask_input: hasMask,
    orig_im_size: originalImageSize,
  };
}

function createLabelmap(viewport, mask, points, labels) {
  const imageId = viewport.getCurrentImageId();
  console.log('*** Creating labelmap data for', imageId);
  const preview = tool.addPreview(viewport.element);
  const {
    previewSegmentIndex,
    memo,
    segmentationId,
    segmentationVoxelManager,
  } = preview;
  const previewVoxelManager = memo?.voxelManager || preview.previewVoxelManager;
  const [width, height, _depth] = previewVoxelManager.dimensions;
  const { data } = mask;
  let setCount = 0;

  for (let j = 0; j < height; j++) {
    const y = Math.round((j * MAX_HEIGHT * 0.9) / height + MAX_HEIGHT * 0.05);
    if (y < 0 || y >= MAX_HEIGHT) {
      continue;
    }
    for (let i = 0; i < width; i++) {
      const x = Math.round((i * MAX_WIDTH * 0.9) / width + MAX_WIDTH * 0.05);
      if (x < 0 || x >= MAX_WIDTH) {
        continue;
      }
      const index = x * 4 + y * 4 * MAX_WIDTH;
      const v = data[index];
      if (v > 0) {
        setCount++;
        previewVoxelManager.setAtIJK(i, j, 0, previewSegmentIndex);
      } else {
        previewVoxelManager.setAtIJK(i, j, 0, null);
      }
    }
  }
  console.log(
    'Modified slices',
    segmentationVoxelManager.getArrayOfSlices(),
    setCount
  );
  triggerSegmentationDataModified(
    segmentationId,
    segmentationVoxelManager.getArrayOfSlices(),
    previewSegmentIndex
  );
}

const boxRadius = 5;

async function decoder(points, labels) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = imageImageData.width;
  canvas.height = imageImageData.height;
  canvasMask.width = imageImageData.width;
  canvasMask.height = imageImageData.height;

  if (!currentImage || currentImage.imageId !== desiredImage.imageId) {
    console.warn('***** Image not current, need to wait for current image');
    return;
  }

  // Comment this line out to draw just the overlay mask data
  ctx.putImageData(imageImageData, 0, 0);

  if (points.length > 0) {
    // need to wait for encoder to be ready
    if (!currentImage.imageEmbeddings) {
      await currentImage.encoder;
    }

    // wait for encoder to deliver embeddings
    const emb = await currentImage.imageEmbeddings;

    // the decoder
    const session = currentImage.decoder;

    const feed = feedForSam(emb, points, labels);
    const start = performance.now();
    const res = await session.run(feed);
    decoder_latency.innerText = `decoder ${currentImage.sessionIndex} ${(
      performance.now() - start
    ).toFixed(1)} ms`;

    for (let i = 0; i < points.length; i += 2) {
      const label = labels[i / 2];
      ctx.fillStyle = label ? 'blue' : 'pink';

      ctx.fillRect(
        points[i] - boxRadius,
        points[i + 1] - boxRadius,
        2 * boxRadius,
        2 * boxRadius
      );
    }
    const mask = res.masks;
    maskImageData = mask.toImageData();
    createLabelmap(viewport, maskImageData, points, labels);
    ctx.globalAlpha = 0.3;
    const { data } = maskImageData;
    const counts = [];
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      if (v > 0) {
        if (v < 255) {
          data[i] = 0;
          if (v > 192) {
            data[i + 1] = 255;
          } else {
            data[i + 2] = v + 64;
          }
        }
        counts[v] = 1 + (counts[v] || 0);
      }
    }
    const bitmap = await createImageBitmap(maskImageData);
    ctx.drawImage(bitmap, 0, 0);

    const ctxMask = canvasMask.getContext('2d');
    ctxMask.globalAlpha = 0.9;
    ctxMask.drawImage(bitmap, 0, 0);
  }
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.trunc(((event.clientX - rect.left) * MAX_WIDTH) / rect.width);
  const y = Math.trunc(((event.clientY - rect.top) * MAX_HEIGHT) / rect.height);
  return [x, y];
}

/**
 * handler to handle click event on canvas
 */
async function handleClick(event) {
  if (isClicked || !currentImage) {
    return;
  }
  try {
    isClicked = true;
    canvas.style.cursor = 'wait';

    const point = getPoint(event);
    const { button } = event;
    const label = button === 2 ? 0 : 1;
    event.preventDefault();
    points.push(point[0]);
    points.push(point[1]);
    labels.push(label);
    await decoder(points, labels);
  } finally {
    canvas.style.cursor = 'default';
    isClicked = false;
  }
  return true;
}

const desiredImage = {
  imageId: null,
  imageIndex: -1,
  decoder: null,
  encoder: null,
};

/**
 * handler called when image available
 */
async function handleImage(imageId, imageSession) {
  const isCurrent = desiredImage.imageId === imageId;
  if (imageId === imageSession.imageId || imageSession.isLoading) {
    return;
  }
  imageSession.isLoading = true;
  imageSession.imageId = imageId;
  try {
    const encoder_latency = document.getElementById('encoder_latency');
    if (isCurrent) {
      encoder_latency.innerText = `Loading image on ${imageSession.sessionIndex}`;
      decoder_latency.innerText = 'Awaiting image';
      canvas.style.cursor = 'wait';
    }
    points = [];
    labels = [];
    const width = MAX_WIDTH;
    const height = MAX_HEIGHT;
    const renderCanvas = isCurrent ? canvas : imageSession.canvas;
    renderCanvas.width = width;
    renderCanvas.height = height;
    imageSession.imageEmbeddings = undefined;

    const ctx = renderCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    await utilities.loadImageToCanvas({ canvas: renderCanvas, imageId });
    renderCanvas.style.width = size;
    renderCanvas.style.height = size;
    if (isCurrent) {
      encoder_latency.innerText = `Rendered image on ${imageSession.sessionIndex}`;
    }

    imageImageData = ctx.getImageData(0, 0, width, height);

    const t = await ort.Tensor.fromImage(imageImageData, {
      resizedWidth: MODEL_WIDTH,
      resizedHeight: MODEL_HEIGHT,
    });
    const feed = config.isSlimSam ? { pixel_values: t } : { input_image: t };
    await imageSession.loader;
    const session = await imageSession.encoder;
    if (!session) {
      log('****** No session');
      return;
    }
    const start = performance.now();
    imageSession.imageEmbeddings = session.run(feed);
    await imageSession.imageEmbeddings;
    if (desiredImage.imageId === imageId) {
      encoder_latency.innerText = `Image Ready ${imageSession.sessionIndex} ${(
        performance.now() - start
      ).toFixed(1)} ms`;
      canvas.style.cursor = 'default';
    }
  } finally {
    imageSession.isLoading = false;
  }

  // Might update the loading image instances
  tryLoad(desiredImage.imageId);
}

/*
 * fetch and cache url
 */
async function fetchAndCache(url, name) {
  try {
    const cache = await caches.open('onnx');
    let cachedResponse = await cache.match(url);
    if (cachedResponse == undefined) {
      await cache.add(url);
      cachedResponse = await cache.match(url);
      log(`${name} (network)`);
    } else {
      log(`${name} (cached)`);
    }
    const data = await cachedResponse.arrayBuffer();
    return data;
  } catch (error) {
    log(`${name} (network)`);
    return await fetch(url).then((response) => response.arrayBuffer());
  }
}

/*
 * load models one at a time
 */
async function load_models(models, imageSession = currentImage) {
  const cache = await caches.open('onnx');
  let missing = 0;
  for (const [name, model] of Object.entries(models)) {
    const cachedResponse = await cache.match(model.url);
    if (cachedResponse === undefined) {
      missing += model.size;
    }
  }
  if (missing > 0) {
    log(`downloading ${missing} MB from network ... it might take a while`);
  } else {
    log('loading...');
  }
  const start = performance.now();
  for (const [name, model] of Object.entries(models)) {
    try {
      const opt = {
        executionProviders: [config.provider],
        enableMemPattern: false,
        enableCpuMemArena: false,
        extra: {
          session: {
            disable_prepacking: '1',
            use_device_allocator_for_initializers: '1',
            use_ort_model_bytes_directly: '1',
            use_ort_model_bytes_for_initializers: '1',
          },
        },
        interOpNumThreads: 4,
        intraOpNumThreads: 2,
      };
      const model_bytes = await fetchAndCache(
        model.url,
        model.name,
        imageSession
      );
      const extra_opt = model.opt || {};
      const sess_opt = { ...opt, ...extra_opt };
      imageSession[model.key] = await ort.InferenceSession.create(
        model_bytes,
        sess_opt
      );
    } catch (e) {
      log(`${model.url} failed, ${e}`);
    }
  }
  const stop = performance.now();
  log(`ready, ${(stop - start).toFixed(1)}ms`);
}

/**
 * Loads the AI model.
 */
async function loadAI() {
  canvas.style.cursor = 'wait';

  decoder_latency = document.getElementById('decoder_latency');
  canvas.onmouseup = handleClick;

  for (let i = 0; i < 1; i++) {
    sessions.push({
      sessionIndex: i,
      encoder: null,
      decoder: null,
      imageEmbeddings: null,
      isLoading: false,
      canvas: canvas, // TODO: document.createElement('canvas'),
    });
    const loader = load_models(MODELS[config.model], sessions[i]).catch((e) => {
      log(e);
    });
    sessions[i].loader = loader;
    if (i === 0) {
      await loader;
    }
  }
}

const size = `${512 / devicePixelRatio}px`;
const content = document.getElementById('content');

addButtonToToolbar({
  title: 'Clear',
  onClick: () => {
    points = [];
    labels = [];
    getCurrentAnnotations().forEach((annotation) =>
      annotationState.removeAnnotation(annotation.annotationUID)
    );
    viewport.render();
    decoder(points, labels);
  },
});

const viewportGrid = document.createElement('div');
let viewport;

viewportGrid.style.width = '95vw';
// viewportGrid.style.flexDirection = 'column';

const viewportId = 'VIEWPORT_ID';
const viewportIds = ['VIEWPORT_ID', 'AXIAL', 'SAGITAL', 'CORONAL'];
const element = document.createElement('div');
const element1 = document.createElement('div');

const elements = [element, element1];
for (const el of elements) {
  el.oncontextmenu = () => false;

  Object.assign(el.style, {
    width: size,
    height: size,
    display: 'inline-block',
  });
  viewportGrid.appendChild(el);
}

Object.assign(canvas.style, {
  width: size,
  height: size,
  display: 'inline-block',
  background: 'red',
});

Object.assign(canvasMask.style, {
  width: size,
  height: size,
  display: 'inline-block',
  background: 'black',
});

viewportGrid.appendChild(canvas);
// viewportGrid.appendChild(canvasMask);

content.appendChild(viewportGrid);

const encoderLatency = document.createElement('div');
encoderLatency.id = 'encoder_latency';
content.appendChild(encoderLatency);

const decoderLatency = document.createElement('div');
decoderLatency.id = 'decoder_latency';
content.appendChild(decoderLatency);

const logDiv = document.createElement('div');
logDiv.id = 'status';
content.appendChild(logDiv);

// ============================= //
addDropdownToToolbar({
  options: { map: toolMap, defaultValue: defaultTool },
  toolGroupId,
});

addSegmentIndexDropdown(segmentationId);

/**
 * Maps world points to destination points.
 * Assumes the destination canvas is scale to fit at 100% in both dimensions,
 * while the source point is also assumed to be in the same position, but not
 * the same scale.
 *
 * TODO - add mapping from index coordinates to dest coordinates
 * TODO - handle non-square aspect ratios (center relative)
 * TODO - handle alternate orientations
 */
function mapAnnotationPoint(worldPoint) {
  const canvasPoint = viewport.worldToCanvas(worldPoint);
  const { width, height } = viewport.canvas;
  const { width: destWidth, height: destHeight } = canvas;

  const x = Math.trunc(
    (canvasPoint[0] * destWidth * devicePixelRatio * 0.9) / width +
      destWidth * 0.05
  );
  const y = Math.trunc(
    (canvasPoint[1] * destHeight * devicePixelRatio * 0.9) / height +
      destHeight * 0.05
  );
  return [x, y];
}

/**
 * This function will try setting the current image to the desired loading image
 * if it isn't already the desired one, and invoke the handleImage.  It also checks
 * the "next" images to see if there are other images which should be tried to load.
 */
function tryLoad(imageId) {
  // Don't try loading something new if the current item is already in progress.
  const loadingSession = sessions.find(
    (session) => session.imageId === imageId
  );
  if (loadingSession) {
    if (desiredImage.imageId === imageId && loadingSession !== currentImage) {
      console.log('***** try load completed - setting current image', imageId);
      currentImage = loadingSession;
      annotationModifiedListener();
    }
    return;
  }
  for (const session of sessions) {
    if (session.isLoading || session === currentImage) {
      continue;
    }
    handleImage(imageId, session);
    return;
  }
  console.log("***** couldn't find a session to load on");
}

/**
 * Gets a list of the include/exclude orientation annotations applying to the
 * current image id.
 */
function getCurrentAnnotations() {
  const annotations = [
    ...annotationState.getAnnotations(defaultTool, element),
    ...annotationState.getAnnotations(excludeTool, element),
  ];
  const currentAnnotations = filterAnnotationsForDisplay(viewport, annotations);
  return currentAnnotations;
}

/**
 * Handle the annotations being added by checking to see if they are the current
 * frame and adding appropriate points to it/updating said points.
 */
async function annotationModifiedListener() {
  if (isClicked || !currentImage || currentImage.isLoading) {
    return;
  }
  const currentAnnotations = getCurrentAnnotations();
  if (!currentAnnotations.length) {
    return;
  }
  try {
    isClicked = true;
    canvas.style.cursor = 'wait';
    points = [];
    labels = [];
    for (const annotation of currentAnnotations) {
      const handle = annotation.data.handles.points[0];
      const point = mapAnnotationPoint(handle);
      const label = annotation.metadata.toolName === excludeTool ? 0 : 1;
      points.push(point[0]);
      points.push(point[1]);
      labels.push(label);
    }
    await decoder(points, labels);
  } finally {
    canvas.style.cursor = 'default';
    isClicked = false;
  }
  return true;
}

/**
 * Adds annotation listeners so that on updates the new annotation gets called
 */
function addAnnotationListeners() {
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_SELECTION_CHANGE,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_MODIFIED,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_COMPLETED,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_ADDED,
    annotationModifiedListener
  );
}

async function interpolateScroll(dir = 1) {
  console.log('**** Navigating next with interpolation');
  tool.acceptPreview(element);
  const annotations = [
    ...annotationState.getAnnotations(defaultTool, element),
    ...annotationState.getAnnotations(excludeTool, element),
  ];

  const currentAnnotations = filterAnnotationsForDisplay(viewport, annotations);
  const viewRef = viewport.getViewReference({
    sliceIndex: viewport.getCurrentImageIdIndex() + dir,
  });
  if (!viewRef) {
    return;
  }

  if (!currentAnnotations.length) {
    viewport.scroll(dir);
    return;
  }

  const nextAnnotations = annotations.filter((filterAnnotation) => {
    const { sliceIndex: filterSliceIndex } = filterAnnotation.metadata;
    return filterSliceIndex === viewRef.sliceIndex;
  });
  if (nextAnnotations.length > 0) {
    console.log('Already has annotations, not interpolating');
    return;
  }
  console.log('Interpolating annotations', currentAnnotations);
  isClicked = true;
  for (const annotation of currentAnnotations) {
    annotation.interpolationUID ||= crypto.randomUUID();
    const newAnnotation = structuredClone(annotation);
    newAnnotation.annotationUID = undefined;
    Object.assign(newAnnotation.metadata, viewRef);
    (newAnnotation as any).cachedStats = {};
    annotationState.addAnnotation(newAnnotation, viewport.element);
  }
  isClicked = false;
  viewport.scroll(dir);
}

const handleKeyEvent = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
    tool.rejectPreview(element);
  } else if (key === 'Enter') {
    tool.acceptPreview(element);
  } else if (key === 'n') {
    interpolateScroll(1);
  }
};

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, { toolMap });
  tool = toolGroup.getToolInstance('ThresholdCircle');

  cornerstoneTools.addTool(SegmentationDisplayTool);
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element: element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0.2, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);
  toolGroup.addViewport(viewportIds[1], renderingEngineId);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);

  // Add a segmentation that will contains the contour annotations
  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedSegmentationImages(imageIds);
  // Set the stack on the viewport
  await viewport.setStack(imageIds, Math.floor(imageIds.length / 2));
  viewport.setOptions({ displayArea: { imageArea: [1, 1] } });

  // Add the canvas after the viewport
  // element.appendChild(canvas);

  await loadAI();
  element.addEventListener(Events.IMAGE_RENDERED, async (evt) => {
    desiredImage.imageId = viewport.getCurrentImageId();
    desiredImage.imageIndex = viewport.getCurrentImageIdIndex();
    if (desiredImage.imageId === currentImage?.imageId) {
      return;
    }
    const ctxMask = canvasMask.getContext('2d');
    ctxMask.clearRect(0, 0, canvasMask.width, canvasMask.height);

    currentImage = null;

    tryLoad(desiredImage.imageId);
    const nextImageId = imageIds[viewport.getCurrentImageIdIndex() + 1];
    if (nextImageId) {
      tryLoad(nextImageId);
    }
  });
  addAnnotationListeners();

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportIds[1])
  );
  volume.load();
  viewport.setOptions({ displayArea: { imageArea: [1, 1] } });
  await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId, {
    volumeId: volumeSegLabelmapId,
  });

  volumeViewport.setVolumes([{ volumeId }]);
  fillVolumeSegmentationWithMockData({
    volumeId: volumeSegLabelmapId,
    cornerstone,
  });

  // Render the image
  renderingEngine.render();

  tryLoad(viewport.getCurrentImageId());
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIdReferenceMap: cstUtils.segmentation.createImageIdReferenceMap(
            imageIds,
            segmentationImageIds
          ),
        },
      },
    },
    {
      segmentationId: volumeSegLabelmapId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: volumeSegLabelmapId,
        },
      },
    },
  ]);

  // Create a segmentation representation associated to the toolGroupId
  const segmentationRepresentationUIDs =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        segmentationId: volumeSegLabelmapId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);

  segmentation.activeSegmentation.setActiveSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUIDs[0]
  );

  element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
    handleKeyEvent(evt);
  });
}

run();
