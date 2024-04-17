import { Types, utilities, eventTarget, Enums } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import ort from 'onnxruntime-web/webgpu';
import { vec3 } from 'gl-matrix';

const { annotation } = cornerstoneTools;
const { state: annotationState } = annotation;
const { Events } = Enums;
const { Events: toolsEvents } = cornerstoneTools.Enums;

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
  } as Types.DisplayArea,
  background: <Types.Point3>[0, 0, 0.2],
};

let getCurrentAnnotations, viewport, excludeTool, tool;

let currentImage;

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
let annotationsNeedUpdating = false;

let maskImageData;

function log(i) {
  document.getElementById('status').innerText += `\n${i}`;
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

/*
    Create a function which will be passed to the promise
    and resolve it when FileReader has finished loading the file.
  */
function getBuffer(fileData) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(fileData);
    reader.onload = function () {
      const arrayBuffer = reader.result;
      const bytes = new Float32Array(arrayBuffer);
      resolve(bytes);
    };
  });
}

let decoderWaiting = false;

/**
 * Implement a machine learning controller to interface with various machine
 * learning algorithms.
 *
 */
export default class MLController {
  /** Store other sessions to be used for next images. */
  private sessions = [];
  private config;

  private loadingAI: Promise<unknown>;

  /**
   * A listener for viewport being rendered that tried loading/encoding the
   * new image if it is different from the previous image.  Will return before
   * the image is encoded.  Can safely be extracted from the instance object and
   * called stand alone.
   */
  public viewportRenderedListener = (_event) => {
    desiredImage.imageId = viewport.getCurrentImageId();
    console.log('********** Viewport rendered', desiredImage.imageId);
    desiredImage.imageIndex = viewport.getCurrentImageIdIndex();
    if (desiredImage.imageId === currentImage?.imageId) {
      return;
    }
    const ctxMask = canvasMask.getContext('2d');
    ctxMask.clearRect(0, 0, canvasMask.width, canvasMask.height);

    currentImage = null;
    decoderWaiting = false;
    this.tryLoad();
  };

  /**
   * Handle the annotations being added by checking to see if they are the current
   * frame and adding appropriate points to it/updating said points.
   */
  public annotationModifiedListener = (event?) => {
    const changeType = event?.detail.changeType;
    if (changeType === cornerstoneTools.Enums.ChangeTypes.StatsUpdated) {
      return;
    }
    const currentAnnotations = getCurrentAnnotations();
    if (!currentAnnotations.length) {
      return;
    }
    annotationsNeedUpdating = true;
    this.tryLoad();
  };

  /**
   * Connects a viewport up to get anotations and updates
   * Note that only one viewport at a time is permitted as the model needs to
   * load data about the active viewport.
   */
  public connectViewport(
    viewportIn,
    getCurrentAnnotationsIn,
    excludeToolIn,
    toolForPreviewIn
  ) {
    if (viewport) {
      this.disconnectViewport(viewport);
    }
    currentImage = null;
    viewport = viewportIn;
    getCurrentAnnotations = getCurrentAnnotationsIn;
    excludeTool = excludeToolIn;
    tool = toolForPreviewIn;

    desiredImage.imageId = viewport.getCurrentImageId();
    viewport.element.addEventListener(
      Events.IMAGE_RENDERED,
      this.viewportRenderedListener
    );
    const boundListener = this.annotationModifiedListener;
    eventTarget.addEventListener(
      toolsEvents.ANNOTATION_MODIFIED,
      boundListener
    );
    eventTarget.addEventListener(
      toolsEvents.ANNOTATION_COMPLETED,
      boundListener
    );
    if (desiredImage.imageId) {
      this.tryLoad();
    }
  }

  public disconnectViewport(viewport) {
    viewport.element.removeEventListener(
      Events.IMAGE_RENDERED,
      this.viewportRenderedListener
    );
    const boundListener = this.annotationModifiedListener;
    eventTarget.removeEventListener(
      toolsEvents.ANNOTATION_MODIFIED,
      boundListener
    );
    eventTarget.removeEventListener(
      toolsEvents.ANNOTATION_COMPLETED,
      boundListener
    );
  }

  /**
   * Loads the AI model.
   */
  public loadAI() {
    this.getConfig();
    if (!this.loadingAI) {
      this.loadingAI = this.loadAIInternal();
    }
    return this.loadingAI;
  }

  /**
   * Does the actual load, separated from the public method to allow starting
   * the AI to load and then waiting for it once other things are also ready.
   */
  protected async loadAIInternal() {
    const { sessions } = this;
    canvas.style.cursor = 'wait';

    decoder_latency = document.getElementById('decoder_latency');
    let loader;
    for (let i = 0; i < 2; i++) {
      sessions.push({
        sessionIndex: i,
        encoder: null,
        decoder: null,
        imageEmbeddings: null,
        isLoading: false,
        canvas: document.createElement('canvas'),
      });
      if (i === 0) {
        loader = this.loadModels(MODELS[this.config.model], sessions[i]).catch(
          (e) => {
            log(e);
          }
        );
        await loader;
      } else {
        // Only the encoder is needed otherwise
        sessions[i].encoder = sessions[0].encoder;
      }
      sessions[i].loader = loader;
    }
  }

  /**
   * Clears the ML related annotations on the specified viewport.
   */
  public clearML(viewport) {
    points = [];
    labels = [];
    getCurrentAnnotations(viewport).forEach((annotation) =>
      annotationState.removeAnnotation(annotation.annotationUID)
    );
  }

  /**
   * Cache the next image as encoded.
   */
  public async cacheImageEncodings(
    current = viewport.getCurrentImageId(),
    offset = 0
  ) {
    const imageIds = viewport.getImageIds();
    if (offset >= imageIds.length) {
      // We are done.
      return;
    }
    const index = (offset + current) % imageIds.length;
    const imageId = imageIds[index];
    if (!imageEncodings.has(imageId)) {
      // Try loading from storage
      await this.loadStorageImageEncoding(imageId, index);
    }
    if (imageEncodings.has(imageId)) {
      this.cacheImageEncodings(current, offset + 1);
      return;
    }
    // Try doing a load, so that UI has priority
    this.tryLoad();
    if (isClicked) {
      setTimeout(() => this.cacheImageEncodings(current, offset), 500);
      return;
    }

    document.getElementById('status').innerText = `Caching ${index}`;
    this.handleImage(imageId, this.sessions[1]).then(() => {
      this.cacheImageEncodings(current, offset + 1);
    });
  }

  /**
   * handler called when image available
   */
  protected async handleImage(imageId, imageSession) {
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
      imageSession.canvasPosition = await utilities.loadImageToCanvas({
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

      const data = await this.restoreImageEncoding(imageId);
      if (data) {
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
        const feed = this.config.isSlimSam
          ? { pixel_values: t }
          : { input_image: t };
        await imageSession.loader;
        const session = await imageSession.encoder;
        if (!session) {
          log('****** No session');
          return;
        }
        const start = performance.now();
        imageSession.imageEmbeddings = session.run(feed);
        const data = await imageSession.imageEmbeddings;
        this.storeImageEncoding(imageId, data);
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

    this.tryLoad();
  }

  /** Awaits a chance to run the decoder */
  protected async runDecoder() {
    if (isClicked || !currentImage?.imageEmbeddings) {
      return;
    }
    isClicked = true;
    try {
      canvas.style.cursor = 'wait';
      await this.decoder(points, labels);
    } finally {
      canvas.style.cursor = 'default';
      isClicked = false;
      decoderWaiting = false;
    }
  }

  /**
   * This function will try setting the current image to the desired loading image
   * if it isn't already the desired one, and invoke the handleImage.  It also checks
   * the "next" images to see if there are other images which should be tried to load.
   */
  public tryLoad() {
    if (!desiredImage.imageId) {
      desiredImage.imageId = viewport.getCurrentImageId();
    }
    // Always use session 0 for the current session
    const [session] = this.sessions;

    if (session.imageId === desiredImage.imageId) {
      if (currentImage !== session) {
        currentImage = session;
      }
      this.updateAnnotations();
      return;
    }
    this.handleImage(desiredImage.imageId, session);
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
  mapAnnotationPoint(worldPoint) {
    const canvasPoint = viewport.worldToCanvas(worldPoint);
    const { width, height } = viewport.canvas;
    const { width: destWidth, height: destHeight } = canvas;

    const x = Math.trunc(
      (canvasPoint[0] * destWidth * devicePixelRatio) / width
    );
    const y = Math.trunc(
      (canvasPoint[1] * destHeight * devicePixelRatio) / height
    );
    return [x, y];
  }

  /**
   * Updates annotations when they have changed in some way, running the decoder.
   */
  updateAnnotations() {
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
      const point = this.mapAnnotationPoint(handle);
      const label = annotation.metadata.toolName === excludeTool ? 0 : 1;
      points.push(point[0]);
      points.push(point[1]);
      labels.push(label);
    }
    this.runDecoder();

    // Make sure any loading required is attempted again as the image may have changed
    this.tryLoad();
  }

  /**
   * Loads encoder data externally.  Applies the image data to the session if
   * successful.
   */
  async restoreImageEncoding(imageId) {
    if (!sharedImageEncoding) {
      return;
    }
    if (!imageEncodings.has(imageId)) {
      await this.loadStorageImageEncoding(imageId);
    }
    const floatData = imageEncodings.get(imageId);
    if (floatData) {
      sharedImageEncoding.image_embeddings.cpuData.set(floatData);
      return sharedImageEncoding;
    }
  }

  async loadStorageImageEncoding(imageId, index = null) {
    try {
      const root = await this.getDirectoryForImageId(imageId);
      const name = this.getFileNameForImageId(imageId);
      const fileHandle = await root.getFileHandle(name);
      document.getElementById(
        'status'
      ).innerText = `Loading from storage ${index}`;
      const file = await fileHandle.getFile();
      if (file) {
        const buffer = await getBuffer(file);
        imageEncodings.set(imageId, buffer);
      }
    } catch (e) {
      console.log('Unable to fetch file', imageId, e);
    }
  }

  async storeImageEncoding(imageId, data) {
    if (!sharedImageEncoding) {
      sharedImageEncoding = data;
    }
    const storeData = data.image_embeddings.cpuData;
    const writeData = new Float32Array(storeData);
    imageEncodings.set(imageId, writeData);
    try {
      const root = await this.getDirectoryForImageId(imageId);
      const name = this.getFileNameForImageId(imageId);
      const fileHandle = await root.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(writeData);
      await writable.close();
    } catch (e) {
      console.log('Unable to write', imageId, e);
    }
  }

  /**
   * Given the mask created by the AI model, assigns the data to a new preview
   * instance of a labelmap.
   */
  createLabelmap(mask, canvasPosition, _points, _labels) {
    const preview = tool.addPreview(viewport.element);
    const { previewSegmentIndex, memo, segmentationId } = preview;
    const previewVoxelManager =
      memo?.voxelManager || preview.previewVoxelManager;
    const { dimensions } = previewVoxelManager;
    const { data } = mask;

    const { origin, topRight, bottomLeft } = canvasPosition;
    const downVec = vec3.subtract(vec3.create(), bottomLeft, origin);
    const rightVec = vec3.subtract(vec3.create(), topRight, origin);
    // Vectors are scaled to unit vectors in CANVAS space
    vec3.scale(downVec, downVec, 1 / canvas.height);
    vec3.scale(rightVec, rightVec, 1 / canvas.width);

    const worldPointJ = vec3.create();
    const worldPoint = vec3.create();
    const imageData = viewport.getDefaultImageData();

    // Assumes that the load to canvas size is bigger than the destination
    // size - if that isnt true, then this should super-sample the data
    for (let j = 0; j < canvas.height; j++) {
      vec3.scaleAndAdd(worldPointJ, origin, downVec, j);
      for (let i = 0; i < canvas.width; i++) {
        vec3.scaleAndAdd(worldPoint, worldPointJ, rightVec, i);
        const ijkPoint = imageData.worldToIndex(worldPoint).map(Math.round);
        if (
          ijkPoint.findIndex((v, index) => v < 0 || v >= dimensions[index]) !==
          -1
        ) {
          continue;
        }
        // 4 values - RGBA - per pixel
        const maskIndex = 4 * (i + j * MAX_WIDTH);
        const v = data[maskIndex];
        if (v > 0) {
          previewVoxelManager.setAtIJKPoint(ijkPoint, previewSegmentIndex);
        } else {
          previewVoxelManager.setAtIJKPoint(ijkPoint, null);
        }
      }
    }
    triggerSegmentationDataModified(segmentationId);
  }

  async decoder(points, labels, useSession = currentImage) {
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
      this.createLabelmap(
        maskImageData,
        useSession.canvasPosition,
        points,
        labels
      );
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

  /*
   * fetch and cache url
   */
  async fetchAndCacheModel(url, name) {
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
  async loadModels(models, imageSession = currentImage) {
    const cache = await caches.open('onnx');
    let missing = 0;
    for (const [_name, model] of Object.entries(models)) {
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
    for (const [_name, model] of Object.entries(models)) {
      try {
        const opt = {
          executionProviders: [this.config.provider],
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
        const model_bytes = await this.fetchAndCacheModel(
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
   * Gets the storage directory for storing the given image id
   */
  async getDirectoryForImageId(imageId) {
    const studySeriesUids = imageId
      .split('/studies/')[1]
      .split('/instances/')[0]
      .split('/');
    const [studyUID, _series, seriesUID] = studySeriesUids;
    const root = await window.navigator.storage.getDirectory();
    const modelRoot = await getOrCreateDir(root, this.config.model);
    const studyRoot = await getOrCreateDir(modelRoot, studyUID);
    const seriesRoot = await getOrCreateDir(studyRoot, seriesUID);
    return seriesRoot;
  }

  /**
   * Gets the file name for the given imageId
   */
  getFileNameForImageId(imageId) {
    const instancesLocation = imageId.indexOf('/instances/');
    if (instancesLocation != -1) {
      const sopLocation = instancesLocation + 11;
      const nextSlash = imageId.indexOf('/', sopLocation);
      return imageId.substring(sopLocation, nextSlash);
    }
  }

  /**
   * create config from url
   */
  getConfig() {
    if (this.config) {
      return this.config;
    }
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
    ort.env.wasm.wasmPaths = 'dist/';
    ort.env.wasm.numThreads = config.threads;
    ort.env.wasm.proxy = config.provider == 'wasm';

    this.config = config;
    return config;
  }
}

/** Gets or creates a diretory name */
async function getOrCreateDir(dir, name) {
  for await (const [key, value] of dir) {
    if (key === name) {
      return value;
    }
  }
  return dir.getDirectoryHandle(name, { create: true });
}

export { viewportOptions };
