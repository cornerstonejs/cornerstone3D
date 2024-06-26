type PlayClipOptions = {
  framesPerSecond?: number;
  frameTimeVector?: number[];
  reverse?: boolean;
  loop?: boolean;
  dynamicCineEnabled?: boolean;
  frameTimeVectorSpeedMultiplier?: number;
  // How many CINE frames to wait for a rendered event to occur before
  // trying to display the image after the next one
  // A CINE frame is attempted every 1 / fps seconds
  // The default is 30 tries, or 1.25 seconds at 24 fps
  waitForRendered?: number;
};

interface ToolData {
  intervalId: number | undefined;
  framesPerSecond: number;
  lastFrameTimeStamp: number | undefined;
  frameTimeVector: number[] | undefined;
  ignoreFrameTimeVector: boolean;
  usingFrameTimeVector: boolean;
  speed: number;
  reverse: boolean;
  loop: boolean;
  dynamicCineEnabled?: boolean;
}

type CinePlayContext = {
  get numScrollSteps(): number;
  get currentStepIndex(): number;
  get frameTimeVectorEnabled(): boolean;
  // How many times has the wait for rendered been tried without showing
  // the next image.
  waitForRenderedCount?: number;
  scroll(delta: number): void;
  // An alternate implementation for video viewports or others that have
  // native play functionality
  play?(fps?: number): number;
};

export type { PlayClipOptions, ToolData, CinePlayContext };
