import { vec3 } from 'gl-matrix';
import type { mat4 } from 'gl-matrix';
import {
  Events as EVENTS,
  VideoEnums as VideoViewportEnum,
  MetadataModules,
} from '../enums';
import type {
  IVideoViewport,
  VideoViewportProperties,
  Point3,
  Point2,
  ICamera,
  InternalVideoCamera,
  VideoViewportInput,
  VOIRange,
  ICanvasActor,
  IImage,
  ViewReferenceSpecifier,
  ViewReference,
  ReferenceCompatibleOptions,
  ImageSetOptions,
  IViewport,
  IStackInput,
  ImageActor,
  CPUIImageData,
  IImageData,
  BoundsIJK,
} from '../types';
import * as metaData from '../metaData';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import triggerEvent from '../utilities/triggerEvent';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';
import CanvasActor from './CanvasActor';
import cache from '../cache/cache';
import uuidv4 from '../utilities/uuidv4';
import { pointInShapeCallback } from '../utilities/pointInShapeCallback';

/**
 * A data type for the scalar data for video data.
 */
export type CanvasScalarData = Uint8ClampedArray & {
  frameNumber?: number;
  getRange?: () => [number, number];
};

/**
 * An object representing a single stack viewport, which is a camera
 * looking into an internal scene, and an associated target output `canvas`.
 */
class VideoViewport extends Viewport {
  public static frameRangeExtractor = /(\/frames\/|[&?]frameNumber=)([^/&?]*)/i;

  public modality;
  // Viewport Data
  protected imageId: string;
  readonly uid;
  readonly renderingEngineId: string;
  readonly canvasContext: CanvasRenderingContext2D;
  private videoElement?: HTMLVideoElement;
  private videoWidth = 0;
  private videoHeight = 0;

  private loop = true;
  private mute = true;
  private isPlaying = false;
  private scrollSpeed = 1;
  private playbackRate = 1;
  private scalarData: CanvasScalarData;

  /**
   * This is used to pause initially so that we get at least one render to allow
   * navigating frames.  Otherwise the viewport is blank initially until the user
   * hits play manually.
   */
  private initialRender: () => void;

  /**
   * The range is the set of frames to play
   */
  private frameRange: [number, number] = [0, 0];

  protected metadata;

  /**
   * The fps, frames per second is used to calculate time/frame mapping values.
   * It is provided by the CINE Module in the metadata, defaulting to 30 if not
   * provided.
   */
  private fps = 30;

  /** The number of frames in the video */
  private numberOfFrames: number;

  private videoCamera: InternalVideoCamera = {
    panWorld: [0, 0],
    parallelScale: 1,
  };

  /**
   * feFilter is an inline string value for the CSS filter on the video
   * CSS filters can reference SVG filters, so for the typical use case here
   * the CSS filter is actually an link link to a SVG filter.
   */
  private feFilter: string;

  /**
   * An average white point value, used to color balance the image so that
   * the given white is mapped to [255,255,255] via multiplication per channel.
   */
  private averageWhite: [number, number, number];

  /**
   * The VOI Range is used to apply contrast/brightness adjustments to the image.
   */
  private voiRange: VOIRange = {
    lower: 0,
    upper: 255,
  };

  constructor(props: VideoViewportInput) {
    super({
      ...props,
      canvas: props.canvas || getOrCreateCanvas(props.element),
    });
    this.canvasContext = this.canvas.getContext('2d');
    this.renderingEngineId = props.renderingEngineId;

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );

    this.videoElement = document.createElement('video');
    this.videoElement.muted = this.mute;
    this.videoElement.loop = this.loop;
    this.videoElement.autoplay = true;
    this.videoElement.crossOrigin = 'anonymous';

    this.addEventListeners();
    this.resize();
  }

  public static get useCustomRenderingPipeline() {
    return true;
  }

  private addEventListeners() {
    this.canvas.addEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private removeEventListeners() {
    this.canvas.removeEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private elementDisabledHandler() {
    this.removeEventListeners();
    this.videoElement.remove();
  }

  public getImageDataMetadata(image: IImage | string) {
    const imageId = typeof image === 'string' ? image : image.imageId;
    const imagePlaneModule = metaData.get(MetadataModules.IMAGE_PLANE, imageId);

    let rowCosines = imagePlaneModule.rowCosines as Point3;
    let columnCosines = imagePlaneModule.columnCosines as Point3;

    // if null or undefined
    if (rowCosines == null || columnCosines == null) {
      rowCosines = [1, 0, 0] as Point3;
      columnCosines = [0, 1, 0] as Point3;
    }

    const rowCosineVec = vec3.fromValues(
      rowCosines[0],
      rowCosines[1],
      rowCosines[2]
    );
    const colCosineVec = vec3.fromValues(
      columnCosines[0],
      columnCosines[1],
      columnCosines[2]
    );

    const { rows, columns } = imagePlaneModule;
    const scanAxisNormal = vec3.create();
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

    let origin = imagePlaneModule.imagePositionPatient;
    // if null or undefined
    if (origin == null) {
      origin = [0, 0, 0];
    }

    const xSpacing = imagePlaneModule.columnPixelSpacing || 1;
    const ySpacing = imagePlaneModule.rowPixelSpacing || 1;
    const xVoxels = imagePlaneModule.columns;
    const yVoxels = imagePlaneModule.rows;

    const zSpacing = 1;
    const zVoxels = 1;

    this.hasPixelSpacing = !!imagePlaneModule.columnPixelSpacing;
    return {
      bitsAllocated: 8,
      numberOfComponents: 3,
      origin,
      rows,
      columns,
      direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal],
      dimensions: [xVoxels, yVoxels, zVoxels],
      spacing: [xSpacing, ySpacing, zSpacing],
      hasPixelSpacing: this.hasPixelSpacing,
      numVoxels: xVoxels * yVoxels * zVoxels,
      imagePlaneModule,
    };
  }

  /**
   * This is a wrapper for setVideo to allow generic behaviour
   *
   * @param _groupId - the id for the overall set of image ids.  Unused for video viewport.
   * @param imageIds - a singleton list containing the imageId of a video.
   */
  public setDataIds(imageIds: string[], options?: ImageSetOptions) {
    this.setVideo(
      imageIds[0],
      ((options.viewReference?.sliceIndex as number) || 0) + 1
    );
  }

  /**
   * Sets the video image id to show and hte frame number.
   * Requirements are to have the imageUrlModule in the metadata
   * with the rendered endpoint being the raw video in video/mp4 format.
   */
  public setVideo(imageId: string, frameNumber?: number): Promise<unknown> {
    this.imageId = Array.isArray(imageId) ? imageId[0] : imageId;
    const imageUrlModule = metaData.get(MetadataModules.IMAGE_URL, imageId);
    if (!imageUrlModule?.rendered) {
      throw new Error(
        `Video Image ID ${imageId} does not have a rendered video view`
      );
    }
    const { rendered } = imageUrlModule;
    const generalSeries = metaData.get(MetadataModules.GENERAL_SERIES, imageId);
    this.modality = generalSeries?.Modality;
    this.metadata = this.getImageDataMetadata(imageId);
    let { cineRate, numberOfFrames } = metaData.get(
      MetadataModules.CINE,
      imageId
    );
    this.numberOfFrames = numberOfFrames;

    return this.setVideoURL(rendered).then(() => {
      if (!numberOfFrames || numberOfFrames === 1) {
        numberOfFrames = Math.round(
          this.videoElement.duration * (cineRate || 30)
        );
      }
      if (!cineRate) {
        cineRate = Math.round(numberOfFrames / this.videoElement.duration);
      }
      this.fps = cineRate;
      this.numberOfFrames = numberOfFrames;
      // 1 based range setting
      this.setFrameRange([1, numberOfFrames]);
      // The initial render allows us to set the frame position - rendering needs
      // to start already playing
      this.initialRender = () => {
        this.initialRender = null;
        this.pause();
        this.setFrameNumber(frameNumber || 1);
      };

      // This is ugly, but without it, the video often fails to render initially
      // so having a play, followed by a pause fixes things.
      // 25 ms is a tested value that seems to work to prevent exceptions
      return new Promise((resolve) => {
        window.setTimeout(() => {
          this.setFrameNumber(frameNumber || 1);
          resolve(this);
        }, 25);
      });
    });
  }

  private async setVideoURL(videoURL: string) {
    return new Promise((resolve) => {
      this.videoElement.src = videoURL;
      this.videoElement.preload = 'auto';

      const loadedMetadataEventHandler = () => {
        this.videoWidth = this.videoElement.videoWidth;
        this.videoHeight = this.videoElement.videoHeight;
        this.videoElement.removeEventListener(
          'loadedmetadata',
          loadedMetadataEventHandler
        );

        this.refreshRenderValues();

        resolve(true);
      };

      this.videoElement.addEventListener(
        'loadedmetadata',
        loadedMetadataEventHandler
      );
    });
  }

  /**
   * Gets all the image ids associated with this video element.  This will
   * have # of frames elements.
   */
  public getImageIds(): string[] {
    const imageIds = new Array<string>(this.numberOfFrames);
    const baseImageId = this.imageId.replace(/[0-9]+$/, '');
    for (let i = 0; i < this.numberOfFrames; i++) {
      imageIds[i] = `${baseImageId}${i + 1}`;
    }
    return imageIds;
  }

  public togglePlayPause(): boolean {
    if (this.isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  public async play() {
    try {
      if (!this.isPlaying) {
        this.isPlaying = true;
        // Play returns a promise that is true when playing completes.
        await this.videoElement.play();
        this.renderWhilstPlaying();
      }
    } catch (e) {
      // No-op, an exception sometimes gets thrown on the initial play, not
      // quite sure why.  Catching it prevents displaying an error
    }
  }

  public pause() {
    try {
      this.isPlaying = false;
      this.videoElement.pause();
    } catch (e) {
      // No-op - sometimes this happens on startup
    }
  }

  public async scroll(delta = 1) {
    await this.pause();

    const videoElement = this.videoElement;
    const renderFrame = this.renderFrame;

    const currentTime = videoElement.currentTime;
    const newTime = currentTime + (delta * this.scrollSpeed) / this.fps;

    videoElement.currentTime = newTime;

    // Need to wait for seek update
    const seekEventListener = (evt) => {
      renderFrame();

      videoElement.removeEventListener('seeked', seekEventListener);
    };

    videoElement.addEventListener('seeked', seekEventListener);
  }

  public async start() {
    const videoElement = this.videoElement;
    const renderFrame = this.renderFrame;

    videoElement.currentTime = 0;

    if (videoElement.paused) {
      // Need to wait for seek update
      const seekEventListener = (evt) => {
        renderFrame();

        videoElement.removeEventListener('seeked', seekEventListener);
      };

      videoElement.addEventListener('seeked', seekEventListener);
    }
  }

  public async end() {
    const videoElement = this.videoElement;
    const renderFrame = this.renderFrame;

    videoElement.currentTime = videoElement.duration;

    if (videoElement.paused) {
      // Need to wait for seek update
      const seekEventListener = (evt) => {
        renderFrame();

        videoElement.removeEventListener('seeked', seekEventListener);
      };

      videoElement.addEventListener('seeked', seekEventListener);
    }
  }

  public async setTime(timeInSeconds: number) {
    const videoElement = this.videoElement;
    const renderFrame = this.renderFrame;

    videoElement.currentTime = timeInSeconds;

    if (videoElement.paused) {
      // Need to wait for seek update
      const seekEventListener = (evt) => {
        renderFrame();

        videoElement.removeEventListener('seeked', seekEventListener);
      };

      videoElement.addEventListener('seeked', seekEventListener);
    }
  }

  public getSliceViewInfo(): {
    width: number;
    height: number;
    sliceIndex: number;
    slicePlane: number;
    sliceToIndexMatrix: mat4;
    indexToSliceMatrix: mat4;
  } {
    throw new Error('Method not implemented.');
  }

  // Sets the frame number - note according to DICOM, this is 1 based
  public async setFrameNumber(frame: number) {
    this.setTime((frame - 1) / this.fps);
  }

  /**
   * Sets the playback frame range.  The video will play over the given set
   * of frames (assuming it is playing).
   *
   * @param frameRange - the minimum to maximum (inclusive) frames to play over
   * @returns
   */
  public setFrameRange(frameRange: number[]) {
    if (!frameRange) {
      this.frameRange = [1, this.numberOfFrames];
      return;
    }
    if (frameRange.length !== 2 || frameRange[0] === frameRange[1]) {
      return;
    }
    this.frameRange = [frameRange[0], frameRange[1]];
  }

  public getFrameRange(): [number, number] {
    return this.frameRange;
  }

  public setProperties(props: VideoViewportProperties) {
    if (props.loop !== undefined) {
      this.videoElement.loop = props.loop;
    }

    if (props.muted !== undefined) {
      this.videoElement.muted = props.muted;
    }

    if (props.playbackRate !== undefined) {
      this.setPlaybackRate(props.playbackRate);
    }

    if (props.scrollSpeed !== undefined) {
      this.setScrollSpeed(props.scrollSpeed);
    }

    if (props.voiRange) {
      this.setVOI(props.voiRange);
    }
  }

  public setPlaybackRate(rate = 1) {
    this.playbackRate = rate;
    // Minimum playback speed in chrome is 0.0625 compared to normal
    if (rate < 0.0625) {
      this.pause();
      return;
    }
    if (!this.videoElement) {
      return;
    }
    this.videoElement.playbackRate = rate;
    this.play();
  }

  public setScrollSpeed(
    scrollSpeed = 1,
    unit = VideoViewportEnum.SpeedUnit.FRAME
  ) {
    this.scrollSpeed =
      unit === VideoViewportEnum.SpeedUnit.SECOND
        ? scrollSpeed * this.fps
        : scrollSpeed;
  }

  public getProperties = (): VideoViewportProperties => {
    return {
      loop: this.videoElement.loop,
      muted: this.videoElement.muted,
      playbackRate: this.playbackRate,
      scrollSpeed: this.scrollSpeed,
      voiRange: { ...this.voiRange },
    };
  };

  public resetProperties() {
    this.setProperties({
      loop: false,
      muted: true,
    });
  }

  protected getScalarData(): CanvasScalarData {
    if (this.scalarData?.frameNumber === this.getFrameNumber()) {
      return this.scalarData;
    }

    if (
      !this.videoElement ||
      !this.videoElement.videoWidth ||
      !this.videoElement.videoHeight
    ) {
      console.debug('Video not ready yet, returning empty scalar data');
      // Return an empty CanvasScalarData object
      const emptyData = new Uint8ClampedArray() as CanvasScalarData;
      emptyData.getRange = () => [0, 255];
      emptyData.frameNumber = -1;
      return emptyData;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(this.videoElement, 0, 0);
    const canvasData = context.getImageData(0, 0, canvas.width, canvas.height);
    const scalarData = canvasData.data as CanvasScalarData;
    scalarData.getRange = () => [0, 255];
    scalarData.frameNumber = this.getFrameNumber();
    this.scalarData = scalarData;
    return scalarData;
  }

  public getImageData(): IImageData | CPUIImageData {
    const { metadata } = this;

    const spacing = metadata.spacing;

    const imageData = {
      getDirection: () => metadata.direction,
      getDimensions: () => metadata.dimensions,
      getRange: () => [0, 255] as Point2,
      getScalarData: () => this.getScalarData(),
      getSpacing: () => metadata.spacing,
      worldToIndex: (point: Point3) => {
        const canvasPoint = this.worldToCanvas(point);
        const pixelCoord = this.canvasToIndex(canvasPoint);
        return [pixelCoord[0], pixelCoord[1], 0] as Point3;
      },
      indexToWorld: (point: Point3, destPoint?: Point3) => {
        const canvasPoint = this.indexToCanvas([point[0], point[1]]);
        return this.canvasToWorld(canvasPoint, destPoint) as Point3;
      },
    };

    const imageDataForReturn = {
      dimensions: metadata.dimensions,
      spacing,
      origin: metadata.origin,
      direction: metadata.direction,
      metadata: {
        Modality: this.modality,
        FrameOfReferenceUID: metadata.FrameOfReferenceUID,
      },
      getScalarData: () => this.getScalarData(),
      scalarData: this.getScalarData(),
      imageData,
      // It is for the annotations to work, since all of them work on voxelManager and not on scalarData now
      voxelManager: {
        forEach: (
          callback: (args: {
            value: unknown;
            index: number;
            pointIJK: Point3;
            pointLPS: Point3;
          }) => void,
          options?: {
            boundsIJK?: BoundsIJK;
            isInObject?: (pointLPS, pointIJK) => boolean;
            returnPoints?: boolean;
            imageData;
          }
        ) => {
          return pointInShapeCallback(options.imageData, {
            pointInShapeFn: options.isInObject ?? (() => true),
            callback: callback,
            boundsIJK: options.boundsIJK,
            returnPoints: options.returnPoints ?? false,
          });
        },
      },
      hasPixelSpacing: this.hasPixelSpacing,
      calibration: this.calibration,
      preScale: {
        scaled: false,
      },
    };

    Object.defineProperty(imageData, 'scalarData', {
      get: () => this.getScalarData(),
      enumerable: true,
    });

    // @ts-expect-error because of voxelmanager
    return imageDataForReturn;
  }

  getMiddleSliceData = () => {
    throw new Error('Method not implemented.');
  };

  useCustomRenderingPipeline = true;

  /**
   * Checks to see if the imageURI is currently being displayed.  The imageURI
   * may contain frame numbers according to the DICOM standard format, which
   * will be stripped to compare the base image URI, and then the values used
   * to check if that frame is currently being displayed.
   *
   * The DICOM standard allows for comma separated values as well, however,
   * this is not supported here, with only a single range or single value
   * being tested.
   *
   * For a single value, the time range +/- 5 frames is permitted to allow
   * the detection to actually succeed when nearby without requiring an exact
   * time frame to be matched.
   *
   * @param imageURI - containing frame number or range.
   * @returns
   */
  public hasImageURI(imageURI: string): boolean {
    // TODO - move annotationFrameRange into core so it can be used here.
    const framesMatch = imageURI.match(VideoViewport.frameRangeExtractor);
    const testURI = framesMatch
      ? imageURI.substring(0, framesMatch.index)
      : imageURI;
    return this.imageId.includes(testURI);
  }

  public setVOI(voiRange: VOIRange): void {
    this.voiRange = voiRange;
    this.setColorTransform();
  }

  public setWindowLevel(windowWidth = 256, windowCenter = 128) {
    const lower = windowCenter - windowWidth / 2;
    const upper = windowCenter + windowWidth / 2 - 1;
    this.setVOI({ lower, upper });
    this.setColorTransform();
  }

  public setAverageWhite(averageWhite: [number, number, number]) {
    this.averageWhite = averageWhite;
    this.setColorTransform();
  }

  protected setColorTransform() {
    if (!this.voiRange && !this.averageWhite) {
      this.feFilter = null;
      return;
    }
    const white = this.averageWhite || [255, 255, 255];
    const maxWhite = Math.max(...white);
    const scaleWhite = white.map((c) => maxWhite / c);
    const { lower = 0, upper = 255 } = this.voiRange || {};
    const wlScale = (upper - lower + 1) / 255;
    const wlDelta = lower / 255;
    this.feFilter = `url('data:image/svg+xml,\
      <svg xmlns="http://www.w3.org/2000/svg">\
        <filter id="colour" color-interpolation-filters="linearRGB">\
        <feColorMatrix type="matrix" \
        values="\
          ${scaleWhite[0] * wlScale} 0 0 0 ${wlDelta} \
          0 ${scaleWhite[1] * wlScale} 0 0 ${wlDelta} \
          0 0 ${scaleWhite[2] * wlScale} 0 ${wlDelta} \
          0 0 0 1 0" />\
        </filter>\
      </svg>#colour')`;

    this.canvas.style.filter = this.feFilter;
  }

  public setCamera(camera: ICamera): void {
    const { parallelScale, focalPoint } = camera;

    // NOTE: the parallel scale should be done first
    // because it affects the focal point later
    if (parallelScale) {
      this.videoCamera.parallelScale =
        this.element.clientHeight / 2 / parallelScale;
    }

    if (focalPoint !== undefined) {
      const focalPointCanvas = this.worldToCanvas(focalPoint);
      const canvasCenter: Point2 = [
        this.element.clientWidth / 2,
        this.element.clientHeight / 2,
      ];

      const panWorldDelta: Point2 = [
        (focalPointCanvas[0] - canvasCenter[0]) /
          this.videoCamera.parallelScale,
        (focalPointCanvas[1] - canvasCenter[1]) /
          this.videoCamera.parallelScale,
      ];

      this.videoCamera.panWorld = [
        this.videoCamera.panWorld[0] - panWorldDelta[0],
        this.videoCamera.panWorld[1] - panWorldDelta[1],
      ];
    }

    this.canvasContext.fillStyle = 'rgba(0,0,0,1)';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.isPlaying) {
      this.renderFrame();
    }
  }

  /**
   * This function returns the imageID associated with either the current
   * frame being displayed, or the range of frames being played.  This may not
   * correspond to any particular imageId that has imageId metadata, as the
   * format is one of:
   * `<DICOMweb URI>/frames/<Start Frame>(-<End Frame>)?`
   * or
   * `<Other URI>[?&]frameNumber=<Start Frame>(-<EndFrame>)?`
   * for a URL parameter.
   *
   * @returns an imageID for video
   */
  public getCurrentImageId() {
    const current = this.imageId.replace(
      '/frames/1',
      this.isPlaying
        ? `/frames/${this.frameRange[0]}-${this.frameRange[1]}`
        : `/frames/${this.getFrameNumber()}`
    );
    return current;
  }

  /**
   *  Gets a target id that can be used to specify how to show this
   */
  public getViewReferenceId(specifier: ViewReferenceSpecifier = {}): string {
    const { sliceIndex: sliceIndex } = specifier;
    if (sliceIndex === undefined) {
      return `videoId:${this.getCurrentImageId()}`;
    }
    if (Array.isArray(sliceIndex)) {
      // Just remove the 1 from the end of the base URL - TODO, handle other types
      return `videoId:${this.imageId.substring(0, this.imageId.length - 1)}${
        sliceIndex[0] + 1
      }-${sliceIndex[1] + 1}`;
    }
    const baseTarget = this.imageId.replace(
      '/frames/1',
      `/frames/${1 + sliceIndex}`
    );
    return `videoId:${baseTarget}`;
  }

  /**
   * Figure out if a given view can be shown in the current viewport.
   */
  public isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    let { imageURI } = options;
    const { referencedImageId, sliceIndex: sliceIndex } = viewRef;
    if (!super.isReferenceViewable(viewRef)) {
      return false;
    }

    const imageId = this.getCurrentImageId();
    if (!imageURI) {
      // Remove the dataLoader scheme and frame number
      // TODO - handle more imageURI types.
      const colonIndex = imageId.indexOf(':');
      imageURI = imageId.substring(colonIndex + 1, imageId.length - 1);
    }

    if (options.withNavigation) {
      return true;
    }
    const currentIndex = this.getSliceIndex();
    if (Array.isArray(sliceIndex)) {
      return currentIndex >= sliceIndex[0] && currentIndex <= sliceIndex[1];
    }
    if (sliceIndex !== undefined) {
      return currentIndex === sliceIndex;
    }
    if (!referencedImageId) {
      return false;
    }
    const match = referencedImageId.match(VideoViewport.frameRangeExtractor);
    if (!match[2]) {
      return true;
    }
    const range = match[2].split('-').map((it) => Number(it));
    const frame = currentIndex + 1;
    return range[0] <= frame && frame <= (range[1] ?? range[0]);
  }

  /**
   * Navigates the video to the specific view reference
   */
  public setViewReference(viewRef: ViewReference): void {
    if (typeof viewRef.sliceIndex === 'number') {
      this.setFrameNumber(viewRef.sliceIndex + 1);
    } else if (Array.isArray(viewRef.sliceIndex)) {
      this.setFrameRange(viewRef.sliceIndex);
    }
  }

  /**
   * Gets a view target that species what type of view is required to show
   * the current view, or the one specified in the forTarget modifiers.
   */
  public getViewReference(
    viewRefSpecifier?: ViewReferenceSpecifier
  ): ViewReference {
    let sliceIndex = viewRefSpecifier?.sliceIndex ?? this.getSliceIndex();
    if (!sliceIndex) {
      sliceIndex = this.isPlaying
        ? [this.frameRange[0] - 1, this.frameRange[1] - 1]
        : this.getCurrentImageIdIndex();
    }
    return {
      ...super.getViewReference(viewRefSpecifier),
      referencedImageId: this.getViewReferenceId(viewRefSpecifier),
      sliceIndex: sliceIndex,
    };
  }

  /**
   * Gets the 1 based frame number (ala DICOM value), eg `1+ currentImageIdIndex`
   */
  public getFrameNumber() {
    // Need to round this as the fps/time isn't exact
    return 1 + this.getCurrentImageIdIndex();
  }

  public getCurrentImageIdIndex() {
    return Math.round(this.videoElement.currentTime * this.fps);
  }

  public getSliceIndex() {
    return this.getCurrentImageIdIndex() / this.scrollSpeed;
  }

  public getCamera(): ICamera {
    const { parallelScale } = this.videoCamera;

    const canvasCenter: Point2 = [
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ];

    // All other viewports have the focal point in canvas coordinates in the center
    // of the canvas, so to make tools work the same, we need to do the same here
    // and convert to the world coordinate system since focal point is in world coordinates.
    const canvasCenterWorld = this.canvasToWorld(canvasCenter);

    return {
      parallelProjection: true,
      focalPoint: canvasCenterWorld,
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight / 2 / parallelScale, // Reverse zoom direction back
      viewPlaneNormal: [0, 0, 1],
    };
  }

  public resetCamera = (): boolean => {
    this.refreshRenderValues();

    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.isPlaying) {
      // If its not replaying, just re-render the frame on move.
      this.renderFrame();
    }
    return true;
  };

  public getNumberOfSlices = (): number => {
    const computedSlices = Math.round(
      (this.videoElement.duration * this.fps) / this.scrollSpeed
    );
    return isNaN(computedSlices) ? this.numberOfFrames : computedSlices;
  };

  public getFrameRate() {
    return this.fps;
  }

  public getFrameOfReferenceUID = (): string => {
    // The video itself is the frame of reference.
    return this.videoElement.src;
  };

  public resize = (): void => {
    const canvas = this.canvas;
    const { clientWidth, clientHeight } = canvas;

    // Set the canvas to be same resolution as the client.
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    this.refreshRenderValues();

    if (!this.isPlaying) {
      // If its not playing, just re-render on resize.
      this.renderFrame();
    }
  };

  /**
   * Converts a VideoViewport canvas coordinate to a video coordinate.
   *
   * @param canvasPos - to convert to world
   * @returns World position
   */
  public canvasToWorld = (
    canvasPos: Point2,
    destPos: Point3 = [0, 0, 0]
  ): Point3 => {
    const pan: Point2 = this.videoCamera.panWorld; // In world coordinates
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const panOffsetCanvas: Point2 = [
      pan[0] * worldToCanvasRatio,
      pan[1] * worldToCanvasRatio,
    ];

    const subCanvasPos: Point2 = [
      canvasPos[0] - panOffsetCanvas[0],
      canvasPos[1] - panOffsetCanvas[1],
    ];

    // Replace the x,y values only in place in the world position
    // as the z is unchanging for video display
    destPos.splice(
      0,
      2,
      subCanvasPos[0] / worldToCanvasRatio,
      subCanvasPos[1] / worldToCanvasRatio
    );
    return destPos;
  };

  /**
   * Converts `[x, y, 0]` world video coordinate to canvas CSS coordinates.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const pan: Point2 = this.videoCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const canvasPos: Point2 = [
      (worldPos[0] + pan[0]) * worldToCanvasRatio,
      (worldPos[1] + pan[1]) * worldToCanvasRatio,
    ];

    return canvasPos;
  };

  public getPan(): Point2 {
    const panWorld = this.videoCamera.panWorld;
    return [panWorld[0], panWorld[1]];
  }

  public getRotation = () => 0;

  /**
   * Uses the transform to convert canvas coordinates into index coordinates.
   */
  protected canvasToIndex = (canvasPos: Point2): Point2 => {
    const transform = this.getTransform();
    transform.invert();

    return transform.transformPoint(
      canvasPos.map((it) => it * devicePixelRatio) as Point2
    );
  };

  protected indexToCanvas = (indexPos: Point2): Point2 => {
    const transform = this.getTransform();
    return transform
      .transformPoint(indexPos)
      .map((it) => it / devicePixelRatio) as Point2;
  };

  /**
   * Sets  initial video camera to center the image area.  The values
   * are set in canvas CSS pixel units and NOT in canvas index units.
   */
  private refreshRenderValues() {
    // this means that each unit (pixel) in the world (video) would be
    // represented by n pixels in the canvas, measured in css pixels
    let worldToCanvasRatio = this.canvas.offsetWidth / this.videoWidth;

    if (this.videoHeight * worldToCanvasRatio > this.canvas.height) {
      // If by fitting the width, we exceed the height of the viewport, then we need to decrease the
      // size of the viewport further by considering its verticality.
      worldToCanvasRatio = this.canvas.offsetHeight / this.videoHeight;
    }

    // Set the width as big as possible, this is the portion of the canvas
    // that the video will occupy.
    const drawWidth = Math.floor(this.videoWidth * worldToCanvasRatio);
    const drawHeight = Math.floor(this.videoHeight * worldToCanvasRatio);

    // calculate x and y offset in order to center the image
    const xOffsetCanvas = (this.canvas.offsetWidth - drawWidth) / 2;
    const yOffsetCanvas = (this.canvas.offsetHeight - drawHeight) / 2;

    const xOffsetWorld = xOffsetCanvas / worldToCanvasRatio;
    const yOffsetWorld = yOffsetCanvas / worldToCanvasRatio;

    this.videoCamera.panWorld = [xOffsetWorld, yOffsetWorld];
    this.videoCamera.parallelScale = worldToCanvasRatio;
  }

  private getWorldToCanvasRatio() {
    return this.videoCamera.parallelScale;
  }

  private getCanvasToWorldRatio() {
    return 1.0 / this.videoCamera.parallelScale;
  }

  public customRenderViewportToCanvas = () => {
    this.renderFrame();
  };

  /**
   * Creates a transform from video index coordinates to canvas coordinates.
   */
  protected getTransform() {
    const panWorld: Point2 = this.videoCamera.panWorld;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();
    const canvasToWorldRatio: number = this.getCanvasToWorldRatio();
    const halfCanvas = [
      this.canvas.offsetWidth / 2,
      this.canvas.offsetHeight / 2,
    ];
    const halfCanvasWorldCoordinates = [
      halfCanvas[0] * canvasToWorldRatio,
      halfCanvas[1] * canvasToWorldRatio,
    ];
    const transform = new Transform();

    // Start by converting into canvas index coordinates FROM canvas css pixel coordinates
    transform.scale(devicePixelRatio, devicePixelRatio);

    // Translate to the center of the canvas (move origin of the transform
    // to the center of the canvas)
    transform.translate(halfCanvas[0], halfCanvas[1]);

    // Scale
    transform.scale(worldToCanvasRatio, worldToCanvasRatio);

    // Apply the translation
    transform.translate(panWorld[0], panWorld[1]);

    // Translate back
    transform.translate(
      -halfCanvasWorldCoordinates[0],
      -halfCanvasWorldCoordinates[1]
    );
    return transform;
  }

  /**
   * Nothing to do for the clipping planes for video as they don't exist.
   */
  public updateCameraClippingPlanesAndRange() {
    // No-op
  }

  public addImages(stackInputs: IStackInput[]) {
    const actors = this.getActors();
    stackInputs.forEach((stackInput) => {
      const image = cache.getImage(stackInput.imageId);

      const imageActor = this.createActorMapper(image);
      const uid = stackInput.actorUID ?? uuidv4();
      if (imageActor) {
        actors.push({ uid, actor: imageActor });
        if (stackInput.callback) {
          stackInput.callback({
            imageActor: imageActor as unknown as ImageActor,
            imageId: stackInput.imageId,
          });
        }
      }
    });
    this.setActors(actors);
  }

  protected createActorMapper(image) {
    return new CanvasActor(this as unknown as IViewport, image);
  }

  /**
   * Renders the video frame to the viewport.
   */
  private renderFrame = () => {
    const dpr = window.devicePixelRatio || 1;
    const transform = this.getTransform();
    const transformationMatrix: number[] = transform.getMatrix();

    const ctx = this.canvasContext;

    ctx.resetTransform();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply the transformation
    ctx.transform(
      transformationMatrix[0] / dpr,
      transformationMatrix[1] / dpr,
      transformationMatrix[2] / dpr,
      transformationMatrix[3] / dpr,
      transformationMatrix[4] / dpr,
      transformationMatrix[5] / dpr
    );

    ctx.drawImage(this.videoElement, 0, 0, this.videoWidth, this.videoHeight);

    for (const actor of this.getActors()) {
      (actor.actor as ICanvasActor).render(this, this.canvasContext);
    }
    this.canvasContext.resetTransform();

    // This is stack new image to agree with stack/non-volume viewports
    triggerEvent(this.element, EVENTS.STACK_NEW_IMAGE, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
      time: this.videoElement.currentTime,
      duration: this.videoElement.duration,
    });
    triggerEvent(this.element, EVENTS.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      imageIndex: this.getCurrentImageIdIndex(),
      numberOfSlices: this.numberOfFrames,
      renderingEngineId: this.renderingEngineId,
      time: this.videoElement.currentTime,
      duration: this.videoElement.duration,
    });

    this.initialRender?.();

    const frame = this.getFrameNumber();
    if (this.isPlaying) {
      if (frame < this.frameRange[0]) {
        this.setFrameNumber(this.frameRange[0]);
      } else if (frame > this.frameRange[1]) {
        if (this.loop) {
          this.setFrameNumber(this.frameRange[0]);
        } else {
          this.pause();
        }
      }
    }
  };

  private renderWhilstPlaying = () => {
    this.renderFrame();

    //wait approximately 16ms and run again
    if (this.isPlaying) {
      requestAnimationFrame(this.renderWhilstPlaying);
    }
  };
}

export default VideoViewport;
