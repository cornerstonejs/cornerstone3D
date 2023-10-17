import { Events as EVENTS, ViewportType } from '../enums';
import {
  IVideoViewport,
  VideoViewportProperties,
  Point3,
  Point2,
} from '../types';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import renderingEngineCache from './renderingEngineCache';
import { triggerEvent } from '../utilities';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';

export type VideoCamera = {
  pan: Point2;
  parallelScale: number;
};

export type IVideoCamera = {
  pan?: Point2;
  parallelScale?: number;
};

export type ViewportInput = {
  id: string;
  renderingEngineId: string;
  type: ViewportType;
  element: HTMLDivElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
  canvas: HTMLCanvasElement;
};

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
  private fps = 30; // TODO We need to find a good solution for this.
  private videoCamera: VideoCamera = {
    pan: [0, 0],
    parallelScale: 1,
  };

  constructor(props: ViewportInput) {
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

    this.addEventListeners();
    this.resize();
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

  public async setVideo(videoURL: string) {
    return new Promise((resolve) => {
      this.videoElement.src = videoURL;

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

  public async next() {
    await this.pause();

    const videoElement = this.videoElement;
    const renderFrame = this.renderFrame;

    const currentTime = videoElement.currentTime;
    const newTime = currentTime + 1.0 / this.fps;

    videoElement.currentTime = newTime;

    // Need to wait for seek update
    const seekEventListener = (evt) => {
      console.log('seeked', evt);

      renderFrame();

      videoElement.removeEventListener('seeked', seekEventListener);
    };

    videoElement.addEventListener('seeked', seekEventListener);
  }

  public async previous() {
    await this.pause();

    const videoElement = this.videoElement;
    const renderFrame = this.renderFrame;

    const currentTime = videoElement.currentTime;
    const newTime = currentTime - 1.0 / this.fps;

    videoElement.currentTime = newTime;

    // Need to wait for seek update
    const seekEventListener = (evt) => {
      console.log('seeked');

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
        console.log('seeked');

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
        console.log('seeked');

        renderFrame();

        videoElement.removeEventListener('seeked', seekEventListener);
      };

      videoElement.addEventListener('seeked', seekEventListener);
    }
  }

  public setProperties(videoInterface: VideoViewportProperties) {
    if (videoInterface.loop !== undefined) {
      this.videoElement.loop = videoInterface.loop;
    }

    if (videoInterface.muted !== undefined) {
      this.videoElement.muted = videoInterface.muted;
    }
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

  public setCamera(
    videoInterface: VideoViewportProperties // TODO use a different interface here.
  ): void {
    if (videoInterface.pan !== undefined) {
      this.videoCamera.pan = videoInterface.pan;
    }

    if (videoInterface.parallelScale !== undefined) {
      this.videoCamera.parallelScale = videoInterface.parallelScale;
    }

    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.isPlaying === false) {
      // If its not replaying, just re-render the frame on move.
      this.renderFrame();
    }
  }

  public getCamera(): VideoViewportProperties {
    return {
      pan: this.videoCamera.pan,
      parallelScale: this.videoCamera.parallelScale,
    };
  }

  public resetCamera = (
    resetPan?: boolean,
    resetZoom?: boolean,
    resetToCenter?: boolean
  ): boolean => {
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
   * Returns the rendering engine driving the `Scene`.
   *
   * @returns The RenderingEngine instance.
   */
  getRenderingEngine() {
    return renderingEngineCache.get(this.renderingEngineId);
  }

  /**
   * Converts a VideoViewport canvas coordinate to a video coordinate.
   *
   * @param canvasPos - to convert to world
   * @returns World position
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    const pan: Point2 = this.videoCamera.pan; // In world coordinates
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const panOffset: Point2 = [
      pan[0] * worldToCanvasRatio,
      pan[1] * worldToCanvasRatio,
    ];

    const subCanvasPos: Point2 = [
      canvasPos[0] - panOffset[0],
      canvasPos[1] - panOffset[1],
    ];

    const worldPos: Point3 = [
      subCanvasPos[0] / worldToCanvasRatio,
      subCanvasPos[1] / worldToCanvasRatio,
      0,
    ];

    return worldPos;
  };

  /**
   * Convers and [x,y] video coordinate to a Cornerstone3D VideoViewport.
   *
   * @param {Point3} worldPos
   * @returns {Point2}
   * @memberof VideoViewport
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const pan: Point2 = this.videoCamera.pan;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const subCanvasPos: Point2 = [
      (worldPos[0] + pan[0]) * worldToCanvasRatio,
      (worldPos[1] + pan[1]) * worldToCanvasRatio,
    ];

    const canvasPos: Point2 = [subCanvasPos[0], subCanvasPos[1]];

    return canvasPos;
  };

  private refreshRenderValues() {
    let worldToCanvasRatio = this.canvas.width / this.videoWidth;

    if (this.videoHeight * worldToCanvasRatio > this.canvas.height) {
      // If by fitting the width, we exceed the height of the viewport, then we need to decrease the
      // size of the viewport further by considering its verticality.
      const secondWorldToCanvasRatio =
        this.canvas.height / (this.videoHeight * worldToCanvasRatio);

      worldToCanvasRatio *= secondWorldToCanvasRatio;
    }

    // Set the width as big as possible
    const drawWidth = Math.floor(this.videoWidth * worldToCanvasRatio);
    const drawHeight = Math.floor(this.videoHeight * worldToCanvasRatio);

    const xOffsetCanvas = this.canvas.width / 2 - drawWidth / 2;
    const yOffsetCanvas = this.canvas.height / 2 - drawHeight / 2;

    const xOffsetWorld = xOffsetCanvas / worldToCanvasRatio;
    const yOffsetWorld = yOffsetCanvas / worldToCanvasRatio;

    this.videoCamera.pan = [xOffsetWorld, yOffsetWorld];
    this.videoCamera.parallelScale = worldToCanvasRatio;
  }

  private getWorldToCanvasRatio() {
    return this.videoCamera.parallelScale;
  }

  private getCanvasToWorldRatio() {
    return 1.0 / this.videoCamera.parallelScale;
  }

  private renderFrame = () => {
    const pan: Point2 = this.videoCamera.pan;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();
    const canvasToWorldRatio: number = this.getCanvasToWorldRatio();

    const halfCanvas = [this.canvas.width / 2, this.canvas.height / 2];
    const halfCanvasWorldCoordinates = [
      halfCanvas[0] * canvasToWorldRatio,
      halfCanvas[1] * canvasToWorldRatio,
    ];

    const transform = new Transform();

    // Translate to the center of the canvas
    transform.translate(halfCanvas[0], halfCanvas[1]);

    // Scale
    transform.scale(worldToCanvasRatio, worldToCanvasRatio);

    // Apply the translation
    transform.translate(pan[0], pan[1]);

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

    // let drawWidth = Math.floor(this.videoWidth * worldToCanvasRatio);

    this.canvasContext.resetTransform();

    triggerEvent(this.element, EVENTS.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
      time: this.videoElement.currentTime,
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
