import { Types, eventTarget, utilities } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import ort from 'onnxruntime-web/webgpu';

import { filterAnnotationsForDisplay } from '../../src/utilities/planar';

const { Enums: csToolsEnums, annotation } = cornerstoneTools;
const { Events: toolsEvents } = csToolsEnums;
const { state: annotationState } = annotation;

const { segmentation } = cornerstoneTools;

const { triggerSegmentationDataModified } =
  segmentation.triggerSegmentationEvents;

const viewportOptions = {
  displayArea: {
    storeAsInitialCamera: true,
    imageArea: [1, 1],
    imageCanvasPoint: {
      // TODO - fix this so top left corner works
      imagePoint: [0.5, 0.5],
      canvasPoint: [0.5, 0.5],
    },
  },
  background: <Types.Point3>[0, 0, 0.2],
};

let getCurrentAnnotations, viewport, excludeTool, tool;

let currentImage;
/** Store other sessions to be used for next images. */
const sessions = [];

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

const desiredImage = {
  imageId: null,
  imageIndex: -1,
  decoder: null,
  encoder: null,
};

const imageEncodings = new Map();
let sharedImageEncoding;

const config = getConfig();

ort.env.wasm.wasmPaths = 'dist/';
ort.env.wasm.numThreads = config.threads;
ort.env.wasm.proxy = config.provider == 'wasm';

const canvas = document.createElement('canvas');
canvas.oncontextmenu = () => false;
const canvasMask = document.createElement('canvas');
const originalImage = document.createElement('img');
originalImage.id = 'original-image';
let decoder_latency;
const boxRadius = 5;

let points = [];
let labels = [];
let imageImageData;
let isClicked = false;
let skipAnnotationUpdates = false;
let annotationsNeedUpdating = false;

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

function createLabelmap(mask, _points, _labels) {
  const preview = tool.addPreview(viewport.element);
  const { previewSegmentIndex, memo, segmentationId } = preview;
  const previewVoxelManager = memo?.voxelManager || preview.previewVoxelManager;
  const [width, height, _depth] = previewVoxelManager.dimensions;
  const { data } = mask;

  for (let j = 0; j < height; j++) {
    const y = Math.round((j * MAX_HEIGHT) / height);
    if (y < 0 || y >= MAX_HEIGHT) {
      continue;
    }
    for (let i = 0; i < width; i++) {
      const x = Math.round((i * MAX_WIDTH) / width);
      if (x < 0 || x >= MAX_WIDTH) {
        continue;
      }
      const index = x * 4 + y * 4 * MAX_WIDTH;
      const v = data[index];
      if (v > 0) {
        previewVoxelManager.setAtIJK(i, j, 0, previewSegmentIndex);
      } else {
        previewVoxelManager.setAtIJK(i, j, 0, null);
      }
    }
  }
  triggerSegmentationDataModified(segmentationId);
}

async function decoder(points, labels, useSession = currentImage) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = imageImageData.width;
  canvas.height = imageImageData.height;
  canvasMask.width = imageImageData.width;
  canvasMask.height = imageImageData.height;

  if (!useSession || useSession.imageId !== desiredImage.imageId) {
    console.warn('***** Image not current, need to wait for current image');
    return;
  }

  // Comment this line out to draw just the overlay mask data
  ctx.putImageData(imageImageData, 0, 0);

  if (points.length) {
    // need to wait for encoder to be ready
    if (!useSession.imageEmbeddings) {
      await useSession.encoder;
    }

    // wait for encoder to deliver embeddings
    const emb = await useSession.imageEmbeddings;

    // the decoder
    const session = useSession.decoder;

    const feed = feedForSam(emb, points, labels);
    const start = performance.now();
    const res = await session.run(feed);
    decoder_latency.innerText = `decoder ${useSession.sessionIndex} ${(
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
    createLabelmap(maskImageData, points, labels);
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

/**
 * Loads encoder data externally.  Applies the image data to the session if
 * successful.
 */
async function restoreImageEncoding(imageId) {
  if (!sharedImageEncoding) {
    return;
  }
  const floatData = imageEncodings.get(imageId);
  if (floatData) {
    sharedImageEncoding.image_embeddings.cpuData = floatData;
    return sharedImageEncoding;
  }
}

async function storeImageEncoding(imageId, data) {
  if (!sharedImageEncoding) {
    console.log('Sharing image encoding', data);
    sharedImageEncoding = data;
  }
  const storeData = data.image_embeddings.cpuData;
  imageEncodings.set(imageId, new Float32Array(storeData));
}

/**
 * handler called when image available
 */
async function handleImage(imageId, imageSession) {
  if (imageId === imageSession.imageId || isClicked) {
    return;
  }
  isClicked = true;
  imageSession.imageId = imageId;
  try {
    const encoder_latency = document.getElementById('encoder_latency');
    const isCurrent = desiredImage.imageId === imageId;
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
    const size = renderCanvas.style.width;

    const ctx = renderCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    await utilities.loadImageToCanvas({
      canvas: renderCanvas,
      imageId,
      viewportOptions,
    });
    renderCanvas.style.width = size;
    renderCanvas.style.height = size;
    if (isCurrent) {
      encoder_latency.innerText = `Rendered image on ${imageSession.sessionIndex}`;
    }

    imageImageData = ctx.getImageData(0, 0, width, height);

    const data = await restoreImageEncoding(imageId);
    if (data) {
      console.log('***** Got image embeddings', data);
      imageSession.imageEmbeddings = data;
      if (desiredImage.imageId === imageId) {
        encoder_latency.innerText = `Cached Image`;
        canvas.style.cursor = 'default';
      }
    } else {
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
      const data = await imageSession.imageEmbeddings;
      storeImageEncoding(imageId, data);
      if (desiredImage.imageId === imageId) {
        encoder_latency.innerText = `Image Ready ${
          imageSession.sessionIndex
        } ${(performance.now() - start).toFixed(1)} ms`;
        canvas.style.cursor = 'default';
      }
    }
  } finally {
    isClicked = false;
  }

  tryLoad();
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

export function setSkipAnnotationUpdates(skip) {
  skipAnnotationUpdates = skip;
}

/**
 * Loads the AI model.
 */
export async function loadAI(
  viewportIn,
  getCurrentAnnotationsIn,
  excludeToolIn,
  toolForPreviewIn
) {
  // TODO - make these member variables in a constructor
  viewport = viewportIn;
  getCurrentAnnotations = getCurrentAnnotationsIn;
  excludeTool = excludeToolIn;
  tool = toolForPreviewIn;

  canvas.style.cursor = 'wait';

  decoder_latency = document.getElementById('decoder_latency');

  for (let i = 0; i < 2; i++) {
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

/**
 * Cache the next image as encoded.
 */
export function cacheImageEncodings(
  current = viewport.getCurrentImageId(),
  offset = 0
) {
  console.log('cacheImageEncodings', offset, current);
  const imageIds = viewport.getImageIds();
  if (offset >= imageIds.length) {
    // We are done.
    return;
  }
  const index = (offset + current) % imageIds.length;
  const imageId = imageIds[index];
  if (imageEncodings.has(imageId)) {
    cacheImageEncodings(current, offset + 1);
    return;
  }
  // Try doing a load, so that UI has priority
  tryLoad();
  if (isClicked) {
    setTimeout(() => cacheImageEncodings(current, offset), 500);
    return;
  }

  document.getElementById('status').innerText = `Caching ${index}`;
  handleImage(imageId, sessions[1]).then(() => {
    cacheImageEncodings(current, offset + 1);
  });
}

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

  const x = Math.trunc((canvasPoint[0] * destWidth * devicePixelRatio) / width);
  const y = Math.trunc(
    (canvasPoint[1] * destHeight * devicePixelRatio) / height
  );
  return [x, y];
}

/**
 * This function will try setting the current image to the desired loading image
 * if it isn't already the desired one, and invoke the handleImage.  It also checks
 * the "next" images to see if there are other images which should be tried to load.
 */
export function tryLoad() {
  // Always use session 0 for the current session
  const session = sessions[0];

  if (session.imageId === desiredImage.imageId) {
    console.log('Session image id is the desired one, not encoding');
    if (currentImage !== session) {
      console.log('Current image being set to session');
      currentImage = session;
    }
    updateAnnotations();
    return;
  }
  console.log('Handling image id', desiredImage.imageId);
  handleImage(desiredImage.imageId, session);
}

/**
 * Handle the annotations being added by checking to see if they are the current
 * frame and adding appropriate points to it/updating said points.
 */
export async function annotationModifiedListener(event?) {
  const changeType = event?.detail.changeType;
  if (changeType === cornerstoneTools.Enums.ChangeTypes.StatsUpdated) {
    return;
  }
  const currentAnnotations = getCurrentAnnotations();
  if (!currentAnnotations.length) {
    console.log('**** No current annotations - not trying load');
    return;
  }
  console.log('**** Annotation modified', currentAnnotations);
  annotationsNeedUpdating = true;
  tryLoad();
}

function updateAnnotations() {
  if (isClicked || !annotationsNeedUpdating || !currentImage) {
    return;
  }
  const currentAnnotations = getCurrentAnnotations();
  annotationsNeedUpdating = false;
  points = [];
  labels = [];
  if (!currentAnnotations?.length) {
    return;
  }
  for (const annotation of currentAnnotations) {
    const handle = annotation.data.handles.points[0];
    const point = mapAnnotationPoint(handle);
    const label = annotation.metadata.toolName === excludeTool ? 0 : 1;
    points.push(point[0]);
    points.push(point[1]);
    labels.push(label);
  }
  runDecoder();

  // Make sure any loading required is attempted again as the image may have changed
  tryLoad();
}

let decoderWaiting = false;

/** Awaits a chance to run the decoder */
async function runDecoder() {
  if (isClicked || !currentImage) {
    console.log('*** runDecoder - not runnable now', isClicked, !!currentImage);
    return;
  } else {
    console.log('Run annotations mask update');
    isClicked = true;
    try {
      canvas.style.cursor = 'wait';
      await decoder(points, labels);
      console.log('Completed decoder');
    } finally {
      canvas.style.cursor = 'default';
      isClicked = false;
      decoderWaiting = false;
    }
  }
}

export async function viewportRenderedListener(_event) {
  desiredImage.imageId = viewport.getCurrentImageId();
  desiredImage.imageIndex = viewport.getCurrentImageIdIndex();
  if (desiredImage.imageId === currentImage?.imageId) {
    return;
  }
  const ctxMask = canvasMask.getContext('2d');
  ctxMask.clearRect(0, 0, canvasMask.width, canvasMask.height);

  currentImage = null;
  decoderWaiting = false;
  tryLoad();
}

/**
 * Clears the ML related annotations on the specified viewport.
 */
export function clearML(viewport) {
  points = [];
  labels = [];
  getCurrentAnnotations(viewport).forEach((annotation) =>
    annotationState.removeAnnotation(annotation.annotationUID)
  );
}

export { viewportOptions };
