import type { mat4 } from 'gl-matrix';
import { Events as EVENTS, MetadataModules } from '../enums';
import type {
  Point3,
  Point2,
  ICamera,
  InternalECGCamera,
  ECGViewportInput,
  ECGChannel,
  ECGWaveformData,
  ECGViewportProperties,
  ViewReferenceSpecifier,
} from '../types';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import triggerEvent from '../utilities/triggerEvent';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';
import * as metaData from '../metaData';

// Rendering constants ported from ecg-dicom reference
const SECONDS_WIDTH = 150; // pixels per second of ECG data
const CHANNEL_SPACING = 5; // vertical spacing between channels in world units
/** Index-space size for amplitude axis so tools (e.g. Probe) use indexWithinDimensions; Int16 range. */
const ECG_AMPLITUDE_INDEX_SIZE = 65536;

// Colors
const COLOR_GRID_MAJOR = '#7f0000'; // dark red
const COLOR_GRID_MINOR = '#3f0000'; // darker red
const COLOR_BASELINE = '#7F4C00'; // brown
const COLOR_TRACE = '#ffffff'; // white
const COLOR_LABEL = '#ffff00'; // yellow
const COLOR_BACKGROUND = '#000000'; // black

/**
 * Computes min and max values for an Int16Array.
 */
function computeMinMax(data: Int16Array): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) {
      min = data[i];
    }
    if (data[i] > max) {
      max = data[i];
    }
  }
  return { min, max };
}

/**
 * Pre-computed layout information for a single visible channel.
 */
interface ChannelLayout {
  channel: ECGChannel;
  itemHeight: number;
  yOffset: number;
  baseline: number;
}

/**
 * ECGViewport renders DICOM ECG waveform data on an HTML canvas.
 * Based on the VideoViewport custom rendering pipeline pattern.
 */
class ECGViewport extends Viewport {
  readonly uid: string;
  readonly renderingEngineId: string;
  readonly canvasContext: CanvasRenderingContext2D;

  private imageId: string | null = null;
  private channels: ECGChannel[] = [];
  private waveformData: ECGWaveformData | null = null;
  private ecgWidth = 0;
  private ecgHeight = 0;
  private channelScale = 0; // world units per data unit

  private ecgCamera: InternalECGCamera = {
    panWorld: [0, 0],
    parallelScale: 1,
  };

  constructor(props: ECGViewportInput) {
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
  }

  /**
   * Loads ECG data from a DICOM imageId by retrieving metadata via the
   * ecgModule metadata provider.
   *
   * @param imageId - A DICOM image ID whose metadata includes waveform data
   */
  public async setEcg(imageId: string): Promise<void> {
    this.imageId = imageId;
    const ecgModule = metaData.get(MetadataModules.ECG, imageId);

    if (!ecgModule?.waveformData?.retrieveBulkData) {
      throw new Error(
        `[ECGViewport] No ECG waveform data for imageId: ${imageId}`
      );
    }

    const {
      numberOfWaveformChannels: numberOfChannels,
      numberOfWaveformSamples: numberOfSamples,
      samplingFrequency,
      waveformBitsAllocated: bitsAllocated = 16,
      waveformSampleInterpretation: sampleInterpretation = 'SS',
      multiplexGroupLabel,
      channelDefinitionSequence: channelDefinitions = [],
    } = ecgModule;

    const channelArrays: Int16Array[] =
      await ecgModule.waveformData.retrieveBulkData();

    // Build channel descriptors with cached min/max
    this.channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      const channelDef = channelDefinitions[i] || {};
      const name =
        channelDef.channelSourceSequence?.codeMeaning ||
        channelDef.ChannelSourceSequence?.CodeMeaning ||
        `Channel ${i + 1}`;
      const data = channelArrays[i] || new Int16Array(0);
      const { min, max } = computeMinMax(data);
      this.channels.push({ name, data, visible: true, min, max });
    }

    this.waveformData = {
      channels: this.channels,
      numberOfChannels,
      numberOfSamples,
      samplingFrequency,
      bitsAllocated,
      sampleInterpretation,
      multiplexGroupLabel,
    };

    // Set calibration from metadata (e.g. sequenceOfEcgRegions from wadors) for measurement tools
    this.calibration = metaData.get(MetadataModules.CALIBRATION, imageId);

    // Calculate ECG width from sample count and frequency
    this.ecgWidth = Math.ceil(
      (numberOfSamples * SECONDS_WIDTH) / samplingFrequency
    );

    this.computeChannelScale();
    this.recalculateHeight();
    this.refreshRenderValues();
    this.renderFrame();
  }

  /**
   * Toggle visibility of a specific channel.
   */
  public setChannelVisibility(index: number, visible: boolean): void {
    if (index >= 0 && index < this.channels.length) {
      this.channels[index].visible = visible;
      this.computeChannelScale();
      this.recalculateHeight();
      this.refreshRenderValues();
      this.renderFrame();
    }
  }

  /**
   * Returns the current channel visibility state.
   */
  public getVisibleChannels(): { name: string; visible: boolean }[] {
    return this.channels.map((ch) => ({
      name: ch.name,
      visible: ch.visible,
    }));
  }

  /**
   * Returns the parsed waveform data.
   */
  public getWaveformData(): ECGWaveformData | null {
    return this.waveformData;
  }

  /**
   * Returns the computed ECG content dimensions in world pixels.
   */
  public getContentDimensions(): { width: number; height: number } {
    return { width: this.ecgWidth, height: this.ecgHeight };
  }

  /**
   * Computes a per-channel amplitude scale so the total stacked height
   * has a reasonable aspect ratio relative to the ECG width.
   * Target: total height = ecgWidth * (canvas height / canvas width),
   * so the initial fit-to-canvas fills the viewport.
   */
  private computeChannelScale(): void {
    const visibleChannels = this.channels.filter(
      (c) => c.visible && c.data.length > 0
    );
    if (visibleChannels.length === 0 || this.ecgWidth === 0) {
      this.channelScale = 0;
      return;
    }

    // Find the maximum amplitude range across all visible channels
    let maxRange = 1;
    for (const channel of visibleChannels) {
      const range = channel.max - channel.min;
      maxRange = Math.max(maxRange, range);
    }

    // Target: total ECG height matches canvas aspect ratio relative to width
    const canvasAspect =
      this.canvas.offsetHeight && this.canvas.offsetWidth
        ? this.canvas.offsetHeight / this.canvas.offsetWidth
        : 2 / 3;
    const targetTotalHeight = this.ecgWidth * canvasAspect;
    const totalSpacing = CHANNEL_SPACING * visibleChannels.length;
    const heightPerChannel =
      (targetTotalHeight - totalSpacing) / visibleChannels.length;

    // Scale: world pixels per data unit, with 1.25x padding for amplitude headroom
    this.channelScale = heightPerChannel / (maxRange * 1.25);
  }

  private recalculateHeight(): void {
    const scale = this.channelScale;
    let totalHeight = 0;
    for (const channel of this.channels) {
      if (!channel.visible || channel.data.length === 0) {
        continue;
      }
      const itemHeight = (channel.max - channel.min) * scale * 1.25;
      totalHeight += itemHeight + CHANNEL_SPACING;
    }
    this.ecgHeight = totalHeight;
  }

  /**
   * Computes the vertical layout for each visible channel.
   * Returns pre-calculated positions used by drawTraces and drawLabels.
   */
  private computeChannelLayouts(): ChannelLayout[] {
    const scale = this.channelScale;
    const layouts: ChannelLayout[] = [];
    let yOffset = 0;

    for (const channel of this.channels) {
      if (!channel.visible || channel.data.length === 0) {
        continue;
      }
      const itemHeight = (channel.max - channel.min) * scale * 1.25;
      yOffset += itemHeight + CHANNEL_SPACING;
      const baseline = yOffset + channel.min * scale;
      layouts.push({ channel, itemHeight, yOffset, baseline });
    }

    return layouts;
  }

  public setProperties(props: ECGViewportProperties): void {
    if (props.visibleChannels !== undefined) {
      for (let i = 0; i < this.channels.length; i++) {
        this.channels[i].visible = props.visibleChannels.includes(i);
      }
      this.computeChannelScale();
      this.recalculateHeight();
      this.refreshRenderValues();
      this.renderFrame();
    }
  }

  public getProperties = (): ECGViewportProperties => {
    return {
      visibleChannels: this.channels
        .map((ch, i) => (ch.visible ? i : -1))
        .filter((i) => i >= 0),
    };
  };

  public resetProperties(): void {
    for (const channel of this.channels) {
      channel.visible = true;
    }
    this.computeChannelScale();
    this.recalculateHeight();
    this.refreshRenderValues();
    this.renderFrame();
  }

  public setCamera(camera: ICamera): void {
    const { parallelScale, focalPoint } = camera;

    if (parallelScale) {
      this.ecgCamera.parallelScale =
        this.element.clientHeight / 2 / parallelScale;
    }

    if (focalPoint !== undefined) {
      const focalPointCanvas = this.worldToCanvas(focalPoint);
      const canvasCenter: Point2 = [
        this.element.clientWidth / 2,
        this.element.clientHeight / 2,
      ];

      const panWorldDelta: Point2 = [
        (focalPointCanvas[0] - canvasCenter[0]) / this.ecgCamera.parallelScale,
        (focalPointCanvas[1] - canvasCenter[1]) / this.ecgCamera.parallelScale,
      ];

      this.ecgCamera.panWorld = [
        this.ecgCamera.panWorld[0] - panWorldDelta[0],
        this.ecgCamera.panWorld[1] - panWorldDelta[1],
      ];
    }

    this.canvasContext.fillStyle = COLOR_BACKGROUND;
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderFrame();
  }

  public getCamera(): ICamera {
    const { parallelScale } = this.ecgCamera;

    const canvasCenter: Point2 = [
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ];

    const canvasCenterWorld = this.canvasToWorld(canvasCenter);

    return {
      parallelProjection: true,
      focalPoint: canvasCenterWorld,
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight / 2 / parallelScale,
      viewPlaneNormal: [0, 0, 1],
    };
  }

  public resetCamera = (): boolean => {
    this.refreshRenderValues();
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderFrame();
    return true;
  };

  public getFrameOfReferenceUID = (): string => {
    return `ecg-viewport-${this.id}`;
  };

  public resize = (): void => {
    const canvas = this.canvas;
    const { clientWidth, clientHeight } = canvas;

    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    if (this.waveformData) {
      this.computeChannelScale();
      this.recalculateHeight();
    }
    this.refreshRenderValues();
    this.renderFrame();
  };

  public canvasToWorld = (
    canvasPos: Point2,
    destPos: Point3 = [0, 0, 0]
  ): Point3 => {
    if (!this.waveformData) {
      destPos[0] = 0;
      destPos[1] = 0;
      destPos[2] = 0;
      return destPos;
    }

    const scale = this.getWorldToCanvasRatio();
    const pan: Point2 = this.ecgCamera.panWorld;
    const layouts = this.computeChannelLayouts();

    // Convert canvas to world coordinates
    const subCanvasPos: Point2 = [
      canvasPos[0] / scale - pan[0],
      canvasPos[1] / scale - pan[1],
    ];

    // Determine which channel the y position falls into
    let z = 0;
    for (let i = 0; i < layouts.length; i++) {
      const layout = layouts[i];
      if (subCanvasPos[1] <= layout.yOffset) {
        z = i;
        break;
      }
      if (i === layouts.length - 1) {
        z = i;
      }
    }

    // Compute x (sample index)
    const x = Math.max(
      0,
      Math.min(
        this.waveformData.numberOfSamples - 1,
        (subCanvasPos[0] * this.waveformData.numberOfSamples) / this.ecgWidth
      )
    );

    // Compute y (amplitude)
    const layout = layouts[z];
    const y = (layout.baseline - subCanvasPos[1]) / this.channelScale;

    destPos[0] = x;
    destPos[1] = y;
    destPos[2] = z;
    return destPos;
  };

  public worldToCanvas = (worldPos: Point3): Point2 => {
    if (!this.waveformData) {
      return [0, 0];
    }

    const scale = this.getWorldToCanvasRatio();
    const pan: Point2 = this.ecgCamera.panWorld;
    const layouts = this.computeChannelLayouts();
    const z = Math.round(worldPos[2]);

    if (z < 0 || z >= layouts.length) {
      return [0, 0];
    }

    const layout = layouts[z];
    const canvasX =
      (worldPos[0] / this.waveformData.numberOfSamples) *
        this.ecgWidth *
        scale +
      pan[0] * scale;
    const canvasY =
      (layout.baseline - worldPos[1] * this.channelScale) * scale +
      pan[1] * scale;

    return [canvasX, canvasY];
  };

  public getPan(): Point2 {
    const panWorld = this.ecgCamera.panWorld;
    return [panWorld[0], panWorld[1]];
  }

  public getRotation = () => 0;

  public getNumberOfSlices = (): number => {
    return 1;
  };

  public getCurrentImageIdIndex = (): number => {
    return 0;
  };

  public getCurrentImageId = (): string | undefined => {
    return this.imageId;
  };

  public getViewReferenceId(_specifier?: ViewReferenceSpecifier): string {
    return `imageId:${this.imageId}`;
  }

  public hasImageURI(imageURI: string): boolean {
    return this.imageId?.includes(imageURI) ?? false;
  }

  /**
   * All annotations created on this ECG viewport are always viewable.
   * The base implementation filters by plane distance, but ECG uses the
   * z coordinate for channel index rather than spatial position, so the
   * plane check incorrectly rejects annotations on non-zero channels.
   */
  public isReferenceViewable(viewRef: {
    FrameOfReferenceUID?: string;
  }): boolean {
    if (
      viewRef.FrameOfReferenceUID &&
      viewRef.FrameOfReferenceUID !== this.getFrameOfReferenceUID()
    ) {
      return false;
    }
    return true;
  }

  public getSliceIndex = (): number => {
    return 0;
  };

  public getImageIds = (): string[] => {
    return this.imageId ? [this.imageId] : [];
  };

  public scroll = (): void => {
    // No-op for ECG viewport - not a stack of images
  };

  public customRenderViewportToCanvas = () => {
    this.renderFrame();
  };

  public updateCameraClippingPlanesAndRange() {
    // No-op for ECG
  }

  private refreshRenderValues() {
    if (!this.ecgWidth || !this.ecgHeight) {
      return;
    }

    let worldToCanvasRatio = this.canvas.offsetWidth / this.ecgWidth;
    if (this.ecgHeight * worldToCanvasRatio > this.canvas.offsetHeight) {
      worldToCanvasRatio = this.canvas.offsetHeight / this.ecgHeight;
    }

    const drawWidth = Math.floor(this.ecgWidth * worldToCanvasRatio);
    const drawHeight = Math.floor(this.ecgHeight * worldToCanvasRatio);

    const xOffsetCanvas = (this.canvas.offsetWidth - drawWidth) / 2;
    const yOffsetCanvas = (this.canvas.offsetHeight - drawHeight) / 2;

    const xOffsetWorld = xOffsetCanvas / worldToCanvasRatio;
    const yOffsetWorld = yOffsetCanvas / worldToCanvasRatio;

    this.ecgCamera.panWorld = [xOffsetWorld, yOffsetWorld];
    this.ecgCamera.parallelScale = worldToCanvasRatio;
  }

  private getWorldToCanvasRatio() {
    return this.ecgCamera.parallelScale;
  }

  protected getTransform() {
    const panWorld: Point2 = this.ecgCamera.panWorld;
    const dpr = window.devicePixelRatio || 1;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();
    const canvasToWorldRatio: number = 1.0 / worldToCanvasRatio;
    const halfCanvas = [
      this.canvas.offsetWidth / 2,
      this.canvas.offsetHeight / 2,
    ];
    const halfCanvasWorldCoordinates = [
      halfCanvas[0] * canvasToWorldRatio,
      halfCanvas[1] * canvasToWorldRatio,
    ];
    const transform = new Transform();

    transform.scale(dpr, dpr);
    transform.translate(halfCanvas[0], halfCanvas[1]);
    transform.scale(worldToCanvasRatio, worldToCanvasRatio);
    transform.translate(panWorld[0], panWorld[1]);
    transform.translate(
      -halfCanvasWorldCoordinates[0],
      -halfCanvasWorldCoordinates[1]
    );
    return transform;
  }

  /**
   * Renders the full ECG frame: background, grid, traces, and labels.
   */
  private renderFrame = () => {
    if (!this.waveformData) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const transform = this.getTransform();
    const m: number[] = transform.getMatrix();
    const ctx = this.canvasContext;

    ctx.resetTransform();
    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply the world-to-canvas transformation
    ctx.setTransform(
      m[0] / dpr,
      m[1] / dpr,
      m[2] / dpr,
      m[3] / dpr,
      m[4] / dpr,
      m[5] / dpr
    );

    const layouts = this.computeChannelLayouts();
    this.drawGrid(ctx);
    this.drawTraces(ctx, layouts);
    this.drawLabels(ctx, layouts);

    ctx.resetTransform();

    triggerEvent(this.element, EVENTS.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
    });
  };

  /**
   * Draws the ECG paper grid.
   */
  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const scale = this.channelScale;
    const pxWidth = this.ecgWidth;
    const pxHeight = this.ecgHeight;

    if (scale <= 0) {
      return;
    }

    // Adaptive horizontal grid: standard ECG minor = 100 uV, but double
    // the unit until lines are at least 8 world-pixels apart.
    const MIN_LINE_SPACING = 8;
    let hGridUnit = 100; // data units per minor horizontal line
    while (hGridUnit * scale < MIN_LINE_SPACING) {
      hGridUnit *= 2;
    }
    const minorH = hGridUnit * scale;
    const majorH = minorH * 5;

    // Vertical grid: time-based, minor = 0.04s, major = 0.2s
    const minorV = SECONDS_WIDTH / 25;
    const majorV = SECONDS_WIDTH / 5;

    // Minor grid lines
    ctx.strokeStyle = COLOR_GRID_MINOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();

    // Horizontal minor lines (skip every 5th — those are major)
    const hLines = Math.floor(pxHeight / minorH);
    for (let h = 1; h <= hLines; h++) {
      if (h % 5 !== 0) {
        const y = h * minorH;
        ctx.moveTo(0, y);
        ctx.lineTo(pxWidth, y);
      }
    }

    // Vertical minor lines (skip every 5th — those are major)
    const vLines = Math.floor(pxWidth / minorV);
    for (let v = 1; v <= vLines; v++) {
      if (v % 5 !== 0) {
        const x = v * minorV;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, pxHeight);
      }
    }
    ctx.stroke();

    // Major grid lines
    ctx.strokeStyle = COLOR_GRID_MAJOR;
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Horizontal major lines
    const hMajorLines = Math.floor(pxHeight / majorH);
    for (let h = 1; h <= hMajorLines; h++) {
      const y = h * majorH;
      ctx.moveTo(0, y);
      ctx.lineTo(pxWidth, y);
    }

    // Vertical major lines
    const vMajorLines = Math.floor(pxWidth / majorV);
    for (let v = 1; v <= vMajorLines; v++) {
      const x = v * majorV;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, pxHeight);
    }
    ctx.stroke();
  }

  /**
   * Draws ECG trace polylines for each visible channel.
   */
  private drawTraces(
    ctx: CanvasRenderingContext2D,
    layouts: ChannelLayout[]
  ): void {
    const scale = this.channelScale;
    const pxWidth = this.ecgWidth;

    for (const { channel, baseline } of layouts) {
      // Draw baseline reference line
      ctx.strokeStyle = COLOR_BASELINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      ctx.lineTo(pxWidth, baseline);
      ctx.stroke();

      // Draw trace
      ctx.strokeStyle = COLOR_TRACE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < channel.data.length; i++) {
        const x = (i * pxWidth) / channel.data.length;
        const y = baseline - channel.data[i] * scale;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  /**
   * Draws channel name labels.
   */
  private drawLabels(
    ctx: CanvasRenderingContext2D,
    layouts: ChannelLayout[]
  ): void {
    // Font size in world coordinates that appears as ~14 screen pixels
    const worldToCanvas = this.getWorldToCanvasRatio();
    const fontSize = 14 / worldToCanvas;

    for (const { channel, itemHeight, yOffset } of layouts) {
      // Label position: top of this channel's area
      const labelY = yOffset - itemHeight + fontSize;

      ctx.font = `${fontSize}px monospace`;
      // Background rect for readability
      const textWidth = ctx.measureText(channel.name).width;
      ctx.fillStyle = COLOR_BACKGROUND;
      ctx.fillRect(5, labelY - fontSize, textWidth + 4, fontSize + 4);
      // Label text
      ctx.fillStyle = COLOR_LABEL;
      ctx.fillText(channel.name, 5, labelY);
    }
  }

  /**
   * Returns image data for tool compatibility (e.g. ZoomTool, ProbeTool).
   * ECG world coordinates: x = sample index, y = amplitude (raw), z = channel number.
   * Amplitude is mapped to index [0, ECG_AMPLITUDE_INDEX_SIZE) so indexWithinDimensions works;
   * drawing across channels remains out of bounds and gets clipped.
   */
  public getImageData() {
    if (!this.waveformData) {
      return null;
    }

    const nSamples = this.waveformData.numberOfSamples;
    const nChannels = this.waveformData.numberOfChannels;
    const dimensions = [nSamples, ECG_AMPLITUDE_INDEX_SIZE, nChannels];
    const spacing = [1, 1, 1];
    const origin = [0, 0, 0];
    const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const amplitudeOffset = ECG_AMPLITUDE_INDEX_SIZE / 2;

    const imageData = {
      getDirection: () => direction,
      getDimensions: () => dimensions,
      getRange: () => [0, 1] as Point2,
      getSpacing: () => spacing,
      worldToIndex: (point: Point3) => {
        return [point[0], point[1] + amplitudeOffset, point[2]] as Point3;
      },
      indexToWorld: (point: Point3) => {
        return [point[0], point[1] - amplitudeOffset, point[2]] as Point3;
      },
    };

    return {
      dimensions,
      spacing,
      origin,
      direction,
      imageData,
      hasPixelSpacing: false,
      calibration: this.calibration,
      preScale: { scaled: false },
      metadata: { Modality: 'ECG' },
    };
  }

  public getSliceViewInfo(): {
    width: number;
    height: number;
    sliceIndex: number;
    slicePlane: number;
    sliceToIndexMatrix: mat4;
    indexToSliceMatrix: mat4;
  } {
    throw new Error('Method not implemented for ECG viewport.');
  }

  getMiddleSliceData = () => {
    throw new Error('Method not implemented for ECG viewport.');
  };
}

export default ECGViewport;
