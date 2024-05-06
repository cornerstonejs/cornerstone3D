import { Types, utilities, eventTarget, Enums } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import ort from 'onnxruntime-web/webgpu';
import { vec3 } from 'gl-matrix';

const { annotation } = cornerstoneTools;
const { state: annotationState } = annotation;
const { Events } = Enums;
const { Events: toolsEvents } = cornerstoneTools.Enums;

const { segmentation } = cornerstoneTools;
const { filterAnnotationsForDisplay } = cornerstoneTools.utilities.planar;

const { triggerSegmentationDataModified } =
  segmentation.triggerSegmentationEvents;

/**
 * clone tensor
 */
function cloneTensor(t) {
  return new ort.Tensor(t.type, Float32Array.from(t.data), t.dims);
}

/*
 * create feed for the original facebook model
 */
function feedForSam(emb, points, labels, modelSize = [1024, 1024]) {
  const maskInput = new ort.Tensor(
    new Float32Array(256 * 256),
    [1, 1, 256, 256]
  );
  const hasMask = new ort.Tensor(new Float32Array([0]), [1]);
  const originalImageSize = new ort.Tensor(new Float32Array(modelSize), [2]);
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
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Float32Array(arrayBuffer);
      resolve(bytes);
    };
  });
}

export enum Loggers {
  Log = 'status',
  Encoder = 'encoder',
  Decoder = 'decoder',
}

/**
 * The ONNXController handles the interaction between CS3D viewports and ONNX segmentation
 * models to allow segmentation of volume and stack viewports using browser local
 * data models.  The process is that a particular view of the viewport is rendered
 * using the loadImageToCanvas to generate the required model size.  This will render
 * without annotations/segmentation.  Then, this view is passed to the encoder model which
 * transforms the data into a set of information about the overall image.  This encoding
 * can take a while, so it is cached.
 *
 * To generate segmentations, the encoded model data is combined with information from the
 * user in the form of annotations on the image to include or exclude regions from the segmentation,
 * and allow the segmentation to be guided.
 *
 * Once the segmentation data has been generated, it is converted from the overlay/bitmap model into
 * a CS3D segmentation map, in the segment index currently being worked on.
 *
 * The encoded model data is stored in browser local storage, and each model
 *  typically consumes about 4 mb per frame.
 */
export default class ONNXController {
  /** Default name for a tool for inclusion points */
  public static MarkerInclude = 'MarkerInclude';
  /** Default name for a tool for exclusion points */
  public static MarkerExclude = 'MarkerExclude';

  /** Some viewport options for loadImageToCanvas */
  public static viewportOptions = {
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
  // the image size on canvas
  maxWidth = 1024;
  maxHeight = 1024;

  // the image size supported by the model
  modelWidth = 1024;
  modelHeight = 1024;

  /**
   * Defines the URL endpoints and render sizes/setup for the various models that
   * can be used.
   */
  static MODELS = {
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

  public canvas = document.createElement('canvas');
  public canvasMask = document.createElement('canvas');

  /** Store other sessions to be used for next images. */
  private sessions = [];
  private config;
  private points = [];
  private labels = [];

  private loadingAI: Promise<unknown>;

  protected viewport;
  protected excludeTool = ONNXController.MarkerExclude;
  protected tool;
  protected currentImage;
  private listeners = [console.log];
  protected desiredImage = {
    imageId: null,
    sampleImageId: null,
    imageIndex: -1,
    decoder: null,
    encoder: null,
  };

  protected imageEncodings = new Map();
  protected sharedImageEncoding;
  protected boxRadius = 5;
  protected imageImageData;
  protected isClicked = false;
  protected annotationsNeedUpdating = false;
  protected maskImageData;
  protected annotationNames = [
    ONNXController.MarkerInclude,
    ONNXController.MarkerExclude,
  ];
  protected model = 'sam_b';

  /**
   * Configure the ML Controller.  No parameters are required, and will default
   * to the basic set of controls using MarkerInclude/Exclude and the default SAM
   * model for segmentation.
   *
   * @param options - a set of options to configure this with
   *    * listeners - a set of functions to call to get log type feedback on the status of the segmentation
   *    * getCurrentAnnotations - a function to get the annotations to apply for segmentation
   *    * annotationNames - a list of annotation names to use to generate segmentations
   *    * models - a set of model configurations to run - note these are added globally to the static models
   */
  constructor(
    options = {
      listeners: null,
      getCurrentAnnotations: null,
      annotationNames: null,
      models: null,
      model: null,
    }
  ) {
    if (options.listeners) {
      this.listeners = [...options.listeners];
    }
    if (options.getCurrentAnnotations) {
      this.getCurrentAnnotations = options.getCurrentAnnotations;
    }
    if (options.annotationNames) {
      this.annotationNames = options.annotationNames;
    }
    if (options.models) {
      Object.assign(ONNXController.MODELS, options.models);
    }
    if (options.model) {
      this.model = options.model;
    }
  }

  /**
   * Logs the message to the given log level
   */
  protected log(logger: Loggers, ...args) {
    for (const listener of this.listeners) {
      listener(logger, ...args);
    }
  }

  /**
   * Gets a list of the include/exclude orientation annotations applying to the
   * current image id.
   */
  protected getCurrentAnnotations = () => {
    const annotations = [];
    const { element } = this.viewport;
    for (const annotationName of this.annotationNames) {
      annotations.push(
        ...annotationState.getAnnotations(annotationName, element)
      );
    }
    const currentAnnotations = filterAnnotationsForDisplay(
      this.viewport,
      annotations
    );
    return currentAnnotations;
  };

  /**
   * A listener for viewport being rendered that tried loading/encoding the
   * new image if it is different from the previous image.  Will return before
   * the image is encoded.  Can be called without binding as it is already
   * bound to the this object.
   * The behaviour of the callback is that if the image has changed in terms
   * of which image (new view reference), then that image is set as the
   * currently desired encoded image, and a new encoding will be read from
   * cache or one will be created and stored in cache.
   *
   * This does not need to be manually bound, the initViewport will bind
   * this to the correct rendering messages.
   */
  public viewportRenderedListener = (_event) => {
    const { viewport, currentImage, desiredImage } = this;
    desiredImage.imageId =
      viewport.getCurrentImageId() || viewport.getReferenceId();
    desiredImage.imageIndex = viewport.getCurrentImageIdIndex();
    if (!desiredImage.imageId) {
      return;
    }
    if (desiredImage.imageId.startsWith('volumeId:')) {
      desiredImage.sampleImageId = viewport.getImageIds(
        viewport.getVolumeId()
      )[0];
    } else {
      desiredImage.sampleImageId = desiredImage.imageId;
    }
    if (desiredImage.imageId === currentImage?.imageId) {
      return;
    }
    const { canvasMask } = this;
    const ctxMask = canvasMask.getContext('2d');
    ctxMask.clearRect(0, 0, canvasMask.width, canvasMask.height);

    this.tryLoad(true);
  };

  /**
   * This is an already bound annotation modified listener, that is added/removed
   * from the viewport by the initViewport method.
   * This listener does the following:
   *   * Gets the annotations, returning immediately if there are no annotations
   *   * Marks the annotations as needing an update
   *   * Starts an encoding on the current image if it is not already encoded
   *   * When the image is encoded, runs the decoder
   *   * Once the decoder has completed, converts the results into a CS3D segmentation preview
   *
   * Note that the decoder run will not occur if the image is changed before the
   * decoder starts running, and that encoding a new image may not start until
   * an ongoing decoder operations has completed.
   */
  public annotationModifiedListener = (_event?) => {
    const currentAnnotations = this.getCurrentAnnotations();
    if (!currentAnnotations.length) {
      return;
    }
    this.annotationsNeedUpdating = true;
    this.tryLoad();
  };

  /**
   * Connects a viewport up to get anotations and updates
   * Note that only one viewport at a time is permitted as the model needs to
   * load data about the active viewport.  This method will disconnect a previous
   * viewport automatically.
   *
   * The viewport must have a labelmap segmentation registered, as well as a
   * tool which extendds LabelmapBaseTool to use for setting the preview view
   * once the decode is completed.  This is provided as toolForPreview
   *
   * @param viewport - a viewport to listen for annotations and rendered events
   * @param toolForPreview - this tool is used to access the preview object and
   *     create a new preview instance.
   */
  public initViewport(viewport, toolForPreview) {
    const { desiredImage } = this;
    if (this.viewport) {
      this.disconnectViewport(this.viewport);
    }
    this.currentImage = null;
    this.viewport = viewport;
    this.tool = toolForPreview;

    desiredImage.imageId =
      viewport.getCurrentImageId() || viewport.getReferenceId();
    if (desiredImage.imageId.startsWith('volumeId:')) {
      desiredImage.sampleImageId = viewport.getImageIds(
        viewport.getVolumeId()
      )[0];
    } else {
      desiredImage.sampleImageId = desiredImage.imageId;
    }

    viewport.element.addEventListener(
      Events.IMAGE_RENDERED,
      this.viewportRenderedListener
    );
    const boundListener = this.annotationModifiedListener;
    eventTarget.addEventListener(toolsEvents.ANNOTATION_ADDED, boundListener);
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

  /**
   * Disconnects the given viewport, removing the listeners.
   */
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
   * Loads the AI model.  This can take a while and will return a promise
   * which resolves when the model is completed.  If the model is already laoded,
   * then the promise returned will be already resolved.  Can be called multiple
   * times and will only initialize once.
   */
  public initModel(): Promise<unknown> {
    this.getConfig();
    if (!this.loadingAI) {
      this.loadingAI = this.loadAIInternal();
    }
    return this.loadingAI;
  }

  /**
   * Does the actual load, separated from the public method to allow starting
   * the AI to load and then waiting for it once other things are also ready.
   * This is done internally so that only a single load/setup is created, allowing
   * for hte load to be started and only waited for when other things are ready.
   */
  protected async loadAIInternal() {
    const { sessions } = this;
    this.canvas.style.cursor = 'wait';

    let loader;
    // Create two sessions, one for the current images, and a second session
    // for caching non-visible images.  This doesn't create two GPU sessions,
    // but does create two sessions for storage of encoded results.
    for (let i = 0; i < 2; i++) {
      sessions.push({
        sessionIndex: i,
        encoder: null,
        decoder: null,
        imageEmbeddings: null,
        isLoading: false,
        canvas: i === 0 ? this.canvas : document.createElement('canvas'),
      });
      if (i === 0) {
        loader = this.loadModels(
          ONNXController.MODELS[this.config.model],
          sessions[i]
        ).catch((e) => {
          this.log(Loggers.Log, "Couldn't load models", e);
        });
        await loader;
      } else {
        // Only the encoder is needed otherwise
        sessions[i].encoder = sessions[0].encoder;
      }
      sessions[i].loader = loader;
    }
  }

  /**
   * Clears the points, labels and annotations related to the ML model from the
   * viewport.
   */
  public clear(viewport) {
    this.points = [];
    this.labels = [];
    this.getCurrentAnnotations(viewport).forEach((annotation) =>
      annotationState.removeAnnotation(annotation.annotationUID)
    );
  }

  /**
   * Cache the next image encoded.  This will start at the current image id,
   * and will keep on fetching additional images, wrapping round to the 0...current
   * position-1 so as to fetch all images.
   * Works with both volume (orthographic) and stack viewports.
   * This will interfere with any image navigation
   */
  public async cacheImageEncodings(
    current = this.viewport.getCurrentImageIdIndex(),
    offset = 0,
    length = 1000_000
  ) {
    const { viewport, imageEncodings } = this;
    if (offset >= length) {
      // We are done.
      return;
    }
    const index = (offset + current) % length;
    const view = viewport.getViewReference({ sliceIndex: index });
    if (!view) {
      length = index;
      return this.cacheImageEncodings(current, offset, length);
    }
    const imageId =
      view.referencedImageId || viewport.getReferenceId({ sliceIndex: index });
    if (!imageEncodings.has(imageId)) {
      // Try loading from storage
      await this.loadStorageImageEncoding(current, imageId, index);
    }
    if (imageEncodings.has(imageId)) {
      this.cacheImageEncodings(current, offset + 1, length);
      return;
    }
    // Try doing a load, so that UI has priority
    this.tryLoad();
    if (this.isClicked) {
      setTimeout(() => this.cacheImageEncodings(current, offset), 500);
      return;
    }

    this.log(Loggers.Log, 'Caching', index, imageId);
    const sampleImageId = viewport.getImageIds()[0];
    this.handleImage({ imageId, sampleImageId }, this.sessions[1]).then(() => {
      this.cacheImageEncodings(current, offset + 1, length);
    });
  }

  /**
   * Handles a new image.  This will render the image to a separate canvas
   * using the load image to canvas, and then will load or generate encoder
   * values into the imageSession provided.
   * If there is already an image being handled or worked on, returns immediately.
   *
   * At the end of the handle, tries calling the tryLoad method to see if there
   * are other high priority tasks to complete.
   */
  protected async handleImage({ imageId, sampleImageId }, imageSession) {
    if (imageId === imageSession.imageId || this.isClicked) {
      return;
    }
    const { viewport, desiredImage } = this;
    this.isClicked = true;
    imageSession.imageId = imageId;
    imageSession.sampleImageId = sampleImageId;
    try {
      const isCurrent = desiredImage.imageId === imageId;
      const { canvas } = imageSession;
      if (isCurrent) {
        this.log(
          Loggers.Encoder,
          `Loading image on ${imageSession.sessionIndex}`
        );
        this.log(Loggers.Decoder, 'Awaiting image');
        canvas.style.cursor = 'wait';
      }
      this.points = [];
      this.labels = [];
      const width = this.maxWidth;
      const height = this.maxHeight;
      canvas.width = width;
      canvas.height = height;
      imageSession.imageEmbeddings = undefined;
      const size = canvas.style.width;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, width, height);

      const renderArguments = {
        canvas,
        imageId,
        viewportOptions: {
          ...viewport.defaultOptions,
          ...ONNXController.viewportOptions,
        },
        viewReference: null,
        renderingEngineId: viewport.getRenderingEngine().id,
      };
      if (imageId.startsWith('volumeId:')) {
        const viewRef = viewport.getViewReference();
        renderArguments.viewReference = viewRef;
        renderArguments.imageId = null;
      }
      imageSession.canvasPosition = await utilities.loadImageToCanvas(
        renderArguments
      );
      canvas.style.width = size;
      canvas.style.height = size;
      if (isCurrent) {
        this.log(
          Loggers.Encoder,
          `Rendered image on ${imageSession.sessionIndex}`
        );
      }

      this.imageImageData = ctx.getImageData(0, 0, width, height);

      const data = await this.restoreImageEncoding(imageSession, imageId);
      if (data) {
        imageSession.imageEmbeddings = data;
        if (desiredImage.imageId === imageId) {
          this.log(Loggers.Encoder, 'Cached Image');
          canvas.style.cursor = 'default';
        }
      } else {
        const t = await ort.Tensor.fromImage(this.imageImageData, {
          resizedWidth: this.modelWidth,
          resizedHeight: this.modelHeight,
        });
        const feed = this.config.isSlimSam
          ? { pixel_values: t }
          : { input_image: t };
        await imageSession.loader;
        const session = await imageSession.encoder;
        if (!session) {
          this.log(Loggers.Log, '****** No session');
          return;
        }
        const start = performance.now();
        imageSession.imageEmbeddings = session.run(feed);
        const data = await imageSession.imageEmbeddings;
        this.storeImageEncoding(imageSession, imageId, data);
        if (desiredImage.imageId === imageId) {
          this.log(
            Loggers.Encoder,
            `Image Ready ${imageSession.sessionIndex} ${(
              performance.now() - start
            ).toFixed(1)} ms`
          );
          canvas.style.cursor = 'default';
        }
      }
    } finally {
      this.isClicked = false;
    }

    this.tryLoad();
  }

  /**
   * This method tries to run the decoder.  It will succeed if the current image
   * has been encoded and is not otherwise already being decoded.
   */
  protected async runDecoder() {
    const { canvas } = this;
    if (this.isClicked || !this.currentImage?.imageEmbeddings) {
      return;
    }
    this.isClicked = true;
    try {
      this.canvas.style.cursor = 'wait';
      await this.decoder(this.points, this.labels);
    } finally {
      canvas.style.cursor = 'default';
      this.isClicked = false;
    }
  }

  /**
   * This function will try setting the current image to the desired loading image
   * if it isn't already the desired one, and invoke the handleImage.
   * If the desired image is already the right one, then it will try to run
   * and outstanding decoder task.
   * This sequence allows out of order decodes to happen and to start the latest
   * encode/decode at the time the last operation has completed.  If the user
   * performs multiple operations, then only the last set is handled.
   */
  public tryLoad(resetImage = false) {
    const { viewport, desiredImage } = this;
    if (!desiredImage.imageId || resetImage) {
      desiredImage.imageId =
        viewport.getCurrentImageId() || viewport.getReferenceId();
      this.currentImage = null;
    }
    // Always use session 0 for the current session
    const [session] = this.sessions;

    if (session.imageId === desiredImage.imageId) {
      if (this.currentImage !== session) {
        this.currentImage = session;
      }
      this.updateAnnotations();
      return;
    }
    this.handleImage(desiredImage, session);
  }

  /**
   * Maps world points to destination points.
   * Assumes the destination canvas is scale to fit at 100% in both dimensions,
   * while the source point is also assumed to be in the same position, but not
   * the same scale.
   */
  mapAnnotationPoint(worldPoint) {
    const { viewport } = this;
    const canvasPoint = viewport.worldToCanvas(worldPoint);
    const { width, height } = viewport.canvas;
    const { width: destWidth, height: destHeight } = this.canvas;

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
   * This will mark the annotations as needing update, so that if the
   * encoding of the image isn't ready yet, or the encoder is otherwise busy,
   * it will run the update again once the tryLoad is done at the end of the task.
   */
  updateAnnotations() {
    if (this.isClicked || !this.annotationsNeedUpdating || !this.currentImage) {
      return;
    }
    const currentAnnotations = this.getCurrentAnnotations();
    this.annotationsNeedUpdating = false;
    this.points = [];
    this.labels = [];
    if (!currentAnnotations?.length) {
      return;
    }
    for (const annotation of currentAnnotations) {
      const handle = annotation.data.handles.points[0];
      const point = this.mapAnnotationPoint(handle);
      const label = annotation.metadata.toolName === this.excludeTool ? 0 : 1;
      this.points.push(point[0]);
      this.points.push(point[1]);
      this.labels.push(label);
    }
    this.runDecoder();
  }

  /**
   * Restores a stored image encoding from memory cache first, and from
   * the browser storage secondly.  This is much faster than re-generating it
   * all the time.
   */
  async restoreImageEncoding(session, imageId) {
    if (!this.sharedImageEncoding) {
      return;
    }
    if (!this.imageEncodings.has(imageId)) {
      await this.loadStorageImageEncoding(session, imageId);
    }
    const floatData = this.imageEncodings.get(imageId);
    if (floatData) {
      this.sharedImageEncoding.image_embeddings.cpuData.set(floatData);
      return this.sharedImageEncoding;
    }
  }

  /**
   * Loads the image encoding from browser storage.
   */
  async loadStorageImageEncoding(session, imageId, index = null) {
    try {
      const root = await this.getDirectoryForImageId(session, imageId);
      const name = this.getFileNameForImageId(imageId);
      if (!root || !name) {
        return null;
      }
      const fileHandle = await findFileEntry(root, name);
      if (!fileHandle) {
        return null;
      }
      this.log(Loggers.Log, 'Loading from storage', index || imageId, name);
      const file = await fileHandle.getFile();
      if (file) {
        const buffer = await getBuffer(file);
        this.imageEncodings.set(imageId, buffer);
      }
    } catch (e) {
      this.log(Loggers.Log, 'Unable to fetch file', imageId, e);
    }
  }

  /**
   * Stores the image encoding to both memory cache and browser storage.
   */
  async storeImageEncoding(session, imageId, data) {
    if (!this.sharedImageEncoding) {
      this.sharedImageEncoding = data;
    }
    const storeData = data.image_embeddings.cpuData;
    const writeData = new Float32Array(storeData);
    this.imageEncodings.set(imageId, writeData);
    try {
      const root = await this.getDirectoryForImageId(session, imageId);
      const name = this.getFileNameForImageId(imageId);
      if (!root || !name) {
        return;
      }
      const fileHandle = await root.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(writeData);
      await writable.close();
      // Note, this data is not considered for persistence as it is assumed multiple
      // series are being worked on.  See the persistance model for adding ahead of
      // time caching.
    } catch (e) {
      this.log(Loggers.Log, 'Unable to write', imageId, e);
    }
  }

  /**
   * Given the mask created by the AI model, assigns the data to a new preview
   * instance of a labelmap and triggers the modified event so that the new
   * segmentation data is visible.  Replaces existing segmentation on that
   * image.
   */
  createLabelmap(mask, canvasPosition, _points, _labels) {
    const { canvas, viewport } = this;
    const preview = this.tool.addPreview(viewport.element);
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
        const maskIndex = 4 * (i + j * this.maxWidth);
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

  /**
   * Runs the GPU decoder operation itself.
   */
  async decoder(points, labels, useSession = this.currentImage) {
    const { canvas, canvasMask, imageImageData, desiredImage, boxRadius } =
      this;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = imageImageData.width;
    canvas.height = imageImageData.height;
    canvasMask.width = imageImageData.width;
    canvasMask.height = imageImageData.height;

    if (!useSession || useSession.imageId !== desiredImage.imageId) {
      this.log(
        Loggers.Log,
        '***** Image not current, need to wait for current image'
      );
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
      this.log(
        Loggers.Decoder,
        `decoder ${useSession.sessionIndex} ${(
          performance.now() - start
        ).toFixed(1)} ms`
      );

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
      this.maskImageData = mask.toImageData();
      this.createLabelmap(
        this.maskImageData,
        useSession.canvasPosition,
        points,
        labels
      );
      ctx.globalAlpha = 0.3;
      const { data } = this.maskImageData;
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
      const bitmap = await createImageBitmap(this.maskImageData);
      ctx.drawImage(bitmap, 0, 0);

      const ctxMask = canvasMask.getContext('2d');
      ctxMask.globalAlpha = 0.9;
      ctxMask.drawImage(bitmap, 0, 0);
    }
  }

  /*
   * fetch and cache the ONNX model at the given url/name.
   */
  async fetchAndCacheModel(url, name) {
    try {
      const cache = await caches.open('onnx');
      let cachedResponse = await cache.match(url);
      if (cachedResponse == undefined) {
        await cache.add(url);
        cachedResponse = await cache.match(url);
        this.log(Loggers.Log, `${name} (network)`);
      } else {
        this.log(Loggers.Log, `${name} (cached)`);
      }
      const data = await cachedResponse.arrayBuffer();
      return data;
    } catch (error) {
      this.log(Loggers.Log, `${name} (network)`);
      return await fetch(url).then((response) => response.arrayBuffer());
    }
  }

  /*
   * load model cache data and creates an instance.  This calls fetchAndCacheModle
   * once for the decoder and encoder, and then instantiates an instance.
   */
  async loadModels(models, imageSession = this.currentImage) {
    const cache = await caches.open('onnx');
    let missing = 0;
    for (const model of Object.values(models) as any[]) {
      const cachedResponse = await cache.match(model.url);
      if (cachedResponse === undefined) {
        missing += model.size;
      }
    }
    if (missing > 0) {
      this.log(
        Loggers.Log,
        `downloading ${missing} MB from network ... it might take a while`
      );
    } else {
      this.log(Loggers.Log, 'loading...');
    }
    const start = performance.now();
    for (const model of Object.values(models) as any[]) {
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
      const model_bytes = await this.fetchAndCacheModel(model.url, model.name);
      const extra_opt = model.opt || {};
      const sess_opt = { ...opt, ...extra_opt };
      imageSession[model.key] = await ort.InferenceSession.create(
        model_bytes,
        sess_opt
      );
    }
    const stop = performance.now();
    this.log(Loggers.Log, `ready, ${(stop - start).toFixed(1)}ms`);
  }

  /**
   * Gets the storage directory for storing the given image id
   */
  async getDirectoryForImageId(session, imageId) {
    if (
      imageId.indexOf('/studies/') === -1 ||
      imageId.indexOf('/instances/') === -1
    ) {
      imageId = session.sampleImageId;
      if (
        !imageId ||
        imageId.indexOf('/studies/') === -1 ||
        imageId.indexOf('/instances/') === -1
      ) {
        return null;
      }
    }
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
   * Gets the storage file name for the given imageId
   */
  getFileNameForImageId(imageId) {
    if (imageId.startsWith('volumeId:')) {
      const sliceIndex = imageId.indexOf('sliceIndex=');
      const focalPoint = imageId.indexOf('&focalPoint=');
      const name = imageId
        .substring(sliceIndex, focalPoint)
        .replace('&', '.')
        .replace('sliceIndex=', 'volume.');
      return name;
    }
    const instancesLocation = imageId.indexOf('/instances/');
    if (instancesLocation != -1) {
      const sopLocation = instancesLocation + 11;
      const nextSlash = imageId.indexOf('/', sopLocation);
      return imageId.substring(sopLocation, nextSlash);
    }
  }

  /**
   * Creates a confgiuration for which encoder/decoder to run.  TODO - move
   * this into the constructor.
   */
  getConfig() {
    if (this.config) {
      return this.config;
    }
    const query = window.location.search.substring(1);
    const config = {
      model: this.model || 'sam_b',
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

/** Gets or creates a storage directory */
async function getOrCreateDir(dir, name) {
  return (
    (await findFileEntry(dir, name)) ||
    dir.getDirectoryHandle(name, { create: true })
  );
}

/** Finds a file entry in the given directory. */
async function findFileEntry(dir, name) {
  for await (const [key, value] of dir) {
    if (key === name) {
      return value;
    }
  }
}
