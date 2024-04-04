import {
  Enums,
  RenderingEngine,
  Types,
  eventTarget,
  imageLoader,
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
const { ViewportType, Events } = Enums;
const { Events: toolsEvents, KeyboardBindings, MouseBindings } = csToolsEnums;
const { state: annotationState } = annotation;
const { style: toolStyle } = cornerstoneTools.annotation.config;

// Define various constants for the tool definition
const toolGroupId = 'DEFAULT_TOOLGROUP_ID';

const segmentationId = `SEGMENTATION_ID`;

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
    },
    {
      name: 'sam-b-decoder',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b_01ec64.decoder.onnx',
      size: 17,
    },
  ],
  sam_b_int8: [
    {
      name: 'sam-b-encoder-int8',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b-encoder-int8.onnx',
      size: 108,
    },
    {
      name: 'sam-b-decoder-int8',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b-decoder-int8.onnx',
      size: 5,
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

let image_embeddings;
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
  const origianlImageSize = new ort.Tensor(
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
    orig_im_size: origianlImageSize,
  };
}

const boxRadius = 5;

async function decoder(points, labels) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = imageImageData.width;
  canvas.height = imageImageData.height;
  canvasMask.width = imageImageData.width;
  canvasMask.height = imageImageData.height;

  // Comment this line out to draw just the overlay mask data
  ctx.putImageData(imageImageData, 0, 0);

  if (points.length > 0) {
    // need to wait for encoder to be ready
    if (image_embeddings === undefined) {
      await MODELS[config.model][0].sess;
    }

    // wait for encoder to deliver embeddings
    const emb = await image_embeddings;

    // the decoder
    const session = MODELS[config.model][1].sess;

    const feed = feedForSam(emb, points, labels);
    const start = performance.now();
    const res = await session.run(feed);
    decoder_latency.innerText = `${(performance.now() - start).toFixed(1)}ms`;

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
    ctx.globalAlpha = 0.3;
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
  if (isClicked) {
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

let isLoading = false;
let loadingImage;
let loadingIndex;

/**
 * handler called when image available
 */
async function handleImage(imageId, imageIndex) {
  if (isLoading || isClicked) {
    loadingImage = imageId;
    loadingIndex = imageIndex;
    return;
  }
  isLoading = true;
  try {
    const encoder_latency = document.getElementById('encoder_latency');
    encoder_latency.innerText = '';
    points = [];
    labels = [];
    decoder_latency.innerText = '';
    canvas.style.cursor = 'wait';
    image_embeddings = undefined;

    const width = MAX_WIDTH;
    const height = MAX_HEIGHT;
    canvas.width = width;
    canvas.height = height;

    canvas.style.background = 'none';
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      viewport.canvas,
      0,
      0,
      viewport.canvas.width,
      viewport.canvas.height,
      0,
      0,
      width,
      height
    );

    const imageUrl = canvas.toDataURL('image/png');
    console.log('Current image', imageId, imageIndex, imageUrl);
    imageImageData = ctx.getImageData(0, 0, width, height);

    const t = await ort.Tensor.fromImage(imageImageData, {
      resizedWidth: MODEL_WIDTH,
      resizedHeight: MODEL_HEIGHT,
    });
    const feed = config.isSlimSam ? { pixel_values: t } : { input_image: t };
    const session = await MODELS[config.model][0].sess;
    const start = performance.now();
    image_embeddings = session.run(feed);
    await image_embeddings;
    encoder_latency.innerText = `${(performance.now() - start).toFixed(1)}ms`;
    canvas.style.cursor = 'default';
  } finally {
    isLoading = false;
  }
  if (loadingImage) {
    if (loadingImage === imageId) {
      loadingImage = null;
      return;
    }
    await handleImage(loadingImage, loadingIndex);
  } else {
    annotationModifiedListener();
  }
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
async function load_models(models) {
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
      };
      const model_bytes = await fetchAndCache(model.url, model.name);
      const extra_opt = model.opt || {};
      const sess_opt = { ...opt, ...extra_opt };
      model.sess = await ort.InferenceSession.create(model_bytes, sess_opt);
    } catch (e) {
      log(`${model.url} failed, ${e}`);
    }
  }
  const stop = performance.now();
  log(`ready, ${(stop - start).toFixed(1)}ms`);
}

async function loadAI() {
  canvas.style.cursor = 'wait';

  decoder_latency = document.getElementById('decoder_latency');
  canvas.onmouseup = handleClick;

  await load_models(MODELS[config.model]).catch((e) => {
    log(e);
  });
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

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const viewportId = 'VIEWPORT_ID';
const element = document.createElement('div');

element.oncontextmenu = () => false;
element.style.width = size;
element.style.height = size;

Object.assign(canvas.style, {
  width: size,
  height: size,
  // top: `-${size}`,
  left: 0,
  position: 'relative',
  display: 'block',
  background: 'red',
});

Object.assign(canvasMask.style, {
  width: size,
  height: size,
  background: 'black',
});

viewportGrid.appendChild(element);
viewportGrid.appendChild(canvas);
viewportGrid.appendChild(canvasMask);

content.appendChild(viewportGrid);

const logDiv = document.createElement('div');
logDiv.id = 'status';
content.appendChild(logDiv);

const encoderLatency = document.createElement('div');
encoderLatency.id = 'encoder_latency';
content.appendChild(encoderLatency);

const decoderLatency = document.createElement('div');
decoderLatency.id = 'decoder_latency';
content.appendChild(decoderLatency);
content.appendChild(originalImage);

// ============================= //

const cancelDrawingEventListener = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

element.addEventListener(
  csToolsEnums.Events.KEY_DOWN,
  cancelDrawingEventListener
);

addDropdownToToolbar({
  options: { map: toolMap, defaultValue: defaultTool },
  toolGroupId,
});

addSegmentIndexDropdown(segmentationId);

function mapAnnotationPoint(worldPoint) {
  const canvasPoint = viewport.worldToCanvas(worldPoint);
  const { width, height } = viewport.canvas;

  const x = Math.trunc((canvasPoint[0] * MAX_WIDTH * devicePixelRatio) / width);
  const y = Math.trunc(
    (canvasPoint[1] * MAX_HEIGHT * devicePixelRatio) / height
  );
  return [x, y];
}

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
  if (isClicked || isLoading) {
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
    if (!isLoading) {
      await decoder(points, labels);
    }
  } finally {
    canvas.style.cursor = 'default';
    isClicked = false;
  }
  return true;
}

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
  const annotations = [
    ...annotationState.getAnnotations(defaultTool, element),
    ...annotationState.getAnnotations(excludeTool, element),
  ];

  const currentAnnotations = filterAnnotationsForDisplay(viewport, annotations);
  const viewRef = viewport.getViewReference({
    sliceIndex: viewport.getCurrentImageIdIndex() + dir,
  });
  if (!viewRef) {
    console.log('At end of direction');
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
    annotationState.addAnnotation(newAnnotation, viewport.element);
  }
  isClicked = false;
  viewport.scroll(dir);
}

const handleKeyEvent = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
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
  ];

  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);

  // Add a segmentation that will contains the contour annotations
  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedSegmentationImages(imageIds);
  // Set the stack on the viewport
  await viewport.setStack(imageIds);
  viewport.setOptions({ displayArea: { imageArea: [1, 1] } });

  // Render the image
  renderingEngine.render();

  // Add the canvas after the viewport
  // element.appendChild(canvas);

  const loadedAI = loadAI();

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
  ]);

  // Create a segmentation representation associated to the toolGroupId
  const segmentationRepresentationUIDs =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);

  segmentation.activeSegmentation.setActiveSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUIDs[0]
  );

  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  // Store the segmentation representation that was just created
  loadedAI.then(() => {
    handleImage(
      viewport.getCurrentImageId(),
      viewport.getCurrentImageIdIndex()
    );
    element.addEventListener(Events.IMAGE_RENDERED, async (evt) => {
      const navigateImageId = viewport.getCurrentImageId();
      handleImage(navigateImageId, viewport.getCurrentImageIdIndex());
    });
    addAnnotationListeners();
  });

  element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
    handleKeyEvent(evt);
  });
}

run();
