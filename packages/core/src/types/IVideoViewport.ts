import type CanvasActor from '../RenderingEngine/CanvasActor';
import type { IViewport, ViewReferenceSpecifier } from './IViewport';
import type { PixelDataTypedArray } from './PixelDataTypedArray';
import type VideoViewportProperties from './VideoViewportProperties';
import type { VOIRange } from './voi';
import type { SpeedUnit } from '../enums/VideoEnums';
import type IImageData from './IImageData';
import type CPUIImageData from './CPUIImageData';

export interface IVideoViewport extends IViewport {
  modality: string;
  canvasContext: CanvasRenderingContext2D;

  setVideo(imageId: string, frameNumber?: number): Promise<unknown>;
  setVideoURL(videoURL: string): Promise<unknown>;
  togglePlayPause(): boolean;
  play(): Promise<void>;
  pause(): void;
  scroll(delta?: number): Promise<void>;
  start(): Promise<void>;
  end(): Promise<void>;
  setTime(timeInSeconds: number): Promise<void>;
  setFrameNumber(frame: number): Promise<void>;
  setFrameRange(frameRange: number[]): void;
  getFrameRange(): [number, number];
  setProperties(props: VideoViewportProperties): void;
  setPlaybackRate(rate?: number): void;
  setScrollSpeed(scrollSpeed?: number, unit?: SpeedUnit): void;
  getProperties(): VideoViewportProperties;
  resetProperties(): void;
  setVOI(voiRange: VOIRange): void;
  setWindowLevel(windowWidth?: number, windowCenter?: number): void;
  setAverageWhite(averageWhite: [number, number, number]): void;
  getFrameNumber(): number;
  getFrameRate(): number;
  getMiddleSliceData(): PixelDataTypedArray;

  // Overrides or modifications to IViewport methods
  getImageData(): IImageData | CPUIImageData; // Returns a more specific type for video data
  getCurrentImageId(): string;
  hasImageURI(imageURI: string): boolean;
  getNumberOfSlices(): number;
  customRenderViewportToCanvas(): void;

  useCustomRenderingPipeline: boolean;
}
