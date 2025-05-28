type PlayClipOptions = {
  /** Frames per second; negative = play in reverse */
  framesPerSecond?: number;
  /** Time‑vector and speed  */
  frameTimeVector?: number[];
  frameTimeVectorSpeedMultiplier?: number;
  /** Play backwards from the start */
  reverse?: boolean;
  /** Jump back to the start/end when finished */
  loop?: boolean;
  /** Use 4‑D volume cine */
  dynamicCineEnabled?: boolean;
  // How many CINE frames to wait for a rendered event to occur before
  // trying to display the image after the next one
  // A CINE frame is attempted every 1 / fps seconds
  // The default is 30 tries, or 1.25 seconds at 24 fps
  waitForRendered?: number;
  /** Ping‑pong */
  bounce?: boolean;
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
  bounce: boolean;
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
