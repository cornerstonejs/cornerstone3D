import { Events as EVENTS, VideoViewport as VideoViewportEnum } from '../enums/index.js';
import {
  IVideoViewport,
  VideoViewportProperties,
  Point3,
  Point2,
  ICamera,
  InternalVideoCamera,
  VideoViewportInput,
} from '../types/index.js';
import { Transform } from './helpers/cpuFallback/rendering/transform.js';
import { triggerEvent } from '../utilities/index.js';
import Viewport from './Viewport.js';
import { getOrCreateCanvas } from './helpers/index.js';

/**
 * An object representing a single stack viewport, which is a camera
 * looking into an internal scene, and an associated target output `canvas`.
 */
class VideoViewport extends Viewport implements IVideoViewport {
  // Viewport Data
  readonly uid;
  readonly renderingEngineId: string;
  readonly canvasContext: CanvasRenderingContext2D;
  private videoElement?: HTMLVideoElement;
  private videoWidth = 0;
  private videoHeight = 0;

  private loop = false;
  private mute = true;
  private isPlaying = false;
  private scrollSpeed = 1;
  private fps = 30; // TODO We need to find a good solution for this.
  private videoCamera: InternalVideoCamera = {
    panWorld: [0, 0],
    parallelScale: 1,
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

  public async setVideoURL(videoURL: string) {
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

  public togglePlayPause(): boolean {
    if (this.isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  public play() {
    if (!this.isPlaying) {
      this.videoElement.play();
      this.isPlaying = true;
      this.renderWhilstPlaying();
    }
  }

  public async pause() {
    if (this.isPlaying) {
      await this.videoElement.pause();
      this.isPlaying = false;
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
        console.log('seeked');

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

  // Sets the frame number - note according to DICOM, this is 1 based
  public async setFrame(frame: number) {
    this.setTime((frame - 1) / this.fps);
  }

  public setProperties(videoInterface: VideoViewportProperties) {
    if (videoInterface.loop !== undefined) {
      this.videoElement.loop = videoInterface.loop;
    }

    if (videoInterface.muted !== undefined) {
      this.videoElement.muted = videoInterface.muted;
    }

    if (videoInterface.playbackRate !== undefined) {
      this.setPlaybackRate(videoInterface.playbackRate);
    }
  }

  public setPlaybackRate(rate = 1) {
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
    };
  };

  public resetProperties() {
    this.setProperties({
      loop: false,
      muted: true,
    });
  }

  public getImageData() {
    return null;
  }

  public setCamera(camera: ICamera): void {
    const { parallelScale, focalPoint } = camera;

    // NOTE: the parallel scale should be done first
    // because it affects the focal point later
    if (camera.parallelScale !== undefined) {
      this.videoCamera.parallelScale = 1 / parallelScale;
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

    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.isPlaying === false) {
      this.renderFrame();
    }
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
      parallelScale: 1 / parallelScale, // Reverse zoom direction back
      viewPlaneNormal: [0, 0, 1],
    };
  }

  public resetCamera = (): boolean => {
    this.refreshRenderValues();

    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.isPlaying === false) {
      // If its not replaying, just re-render the frame on move.
      this.renderFrame();
    }
    return true;
  };

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

    if (this.isPlaying === false) {
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
  public canvasToWorld = (canvasPos: Point2): Point3 => {
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

    const worldPos: Point3 = [
      subCanvasPos[0] / worldToCanvasRatio,
      subCanvasPos[1] / worldToCanvasRatio,
      0,
    ];

    return worldPos;
  };

  /**
   * Converts and [x,y] video coordinate to a Cornerstone3D VideoViewport.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const pan: Point2 = this.videoCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const subCanvasPos: Point2 = [
      (worldPos[0] + pan[0]) * worldToCanvasRatio,
      (worldPos[1] + pan[1]) * worldToCanvasRatio,
    ];

    const canvasPos: Point2 = [subCanvasPos[0], subCanvasPos[1]];

    return canvasPos;
  };

  private refreshRenderValues() {
    // this means that each unit (pixel) in the world (video) would be
    // represented by n pixels in the canvas.
    let worldToCanvasRatio = this.canvas.width / this.videoWidth;

    if (this.videoHeight * worldToCanvasRatio > this.canvas.height) {
      // If by fitting the width, we exceed the height of the viewport, then we need to decrease the
      // size of the viewport further by considering its verticality.
      const secondWorldToCanvasRatio =
        this.canvas.height / (this.videoHeight * worldToCanvasRatio);

      worldToCanvasRatio *= secondWorldToCanvasRatio;
    }

    // Set the width as big as possible, this is the portion of the canvas
    // that the video will occupy.
    const drawWidth = Math.floor(this.videoWidth * worldToCanvasRatio);
    const drawHeight = Math.floor(this.videoHeight * worldToCanvasRatio);

    // calculate x and y offset in order to center the image
    const xOffsetCanvas = this.canvas.width / 2 - drawWidth / 2;
    const yOffsetCanvas = this.canvas.height / 2 - drawHeight / 2;

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

  private renderFrame = () => {
    const panWorld: Point2 = this.videoCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();
    const canvasToWorldRatio: number = this.getCanvasToWorldRatio();

    const halfCanvas = [this.canvas.width / 2, this.canvas.height / 2];
    const halfCanvasWorldCoordinates = [
      halfCanvas[0] * canvasToWorldRatio,
      halfCanvas[1] * canvasToWorldRatio,
    ];

    const transform = new Transform();

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
    const transformationMatrix: number[] = transform.getMatrix();

    this.canvasContext.transform(
      transformationMatrix[0],
      transformationMatrix[1],
      transformationMatrix[2],
      transformationMatrix[3],
      transformationMatrix[4],
      transformationMatrix[5]
    );

    this.canvasContext.drawImage(
      this.videoElement,
      0,
      0,
      this.videoWidth,
      this.videoHeight
    );

    this.canvasContext.resetTransform();

    triggerEvent(this.element, EVENTS.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
      time: this.videoElement.currentTime,
      duration: this.videoElement.duration,
    });
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
