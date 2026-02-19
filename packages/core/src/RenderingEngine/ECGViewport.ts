import type { mat4 } from 'gl-matrix';
import { Events as EVENTS } from '../enums';
import type {
  Point3,
  Point2,
  ICamera,
  InternalECGCamera,
  ECGViewportInput,
  ECGChannel,
  ECGWaveformData,
  ECGViewportProperties,
  WaveformSequenceInput,
  WaveformDataSource,
} from '../types';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import triggerEvent from '../utilities/triggerEvent';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';

// Rendering constants ported from ecg-dicom reference
const SECONDS_WIDTH = 150; // pixels per second of ECG data
const CHANNEL_SPACING = 5; // vertical spacing between channels in world units

// Colors
const COLOR_GRID_MAJOR = '#7f0000'; // dark red
const COLOR_GRID_MINOR = '#3f0000'; // darker red
const COLOR_BASELINE = '#7F4C00'; // brown
const COLOR_TRACE = '#ffffff'; // white
const COLOR_LABEL = '#ffff00'; // yellow
const COLOR_BACKGROUND = '#000000'; // black

/**
 * Decodes a base64 string to a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts raw waveform buffer to per-channel Int16Array data.
 * Handles interleaved 16-bit signed short format.
 */
function convertBuffer(
  dataSrc: ArrayBuffer | Uint8Array,
  numberOfChannels: number,
  numberOfSamples: number,
  bits: number,
  type: string
): Int16Array[] {
  const data = new Uint8Array(dataSrc);

  if (bits === 16 && type === 'SS') {
    const ret: Int16Array[] = [];
    const bytesPerSample = 2;
    const totalBytes = bytesPerSample * numberOfChannels * numberOfSamples;
    const length = Math.min(data.length, totalBytes);

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const buffer = new Int16Array(numberOfSamples);
      ret.push(buffer);
      let sampleI = 0;
      for (
        let sample = 2 * channel;
        sample < length;
        sample += 2 * numberOfChannels
      ) {
        const highByte = data[sample + 1];
        const lowByte = data[sample];
        const sign = highByte & 0x80;
        buffer[sampleI++] = sign
          ? 0xffff0000 | (highByte << 8) | lowByte
          : (highByte << 8) | lowByte;
      }
    }
    return ret;
  }

  console.warn(
    `[ECGViewport] Unsupported waveform format: ${bits}-bit ${type}. Only 16-bit SS is supported.`
  );
  return [];
}

/**
 * Decodes multipart/related response to extract binary parts.
 */
function multipartDecode(response: ArrayBuffer): ArrayBuffer[] {
  const message = new Uint8Array(response);
  const separator = new TextEncoder().encode('\r\n\r\n');

  // Find the header separator
  const headerIndex = findToken(message, separator, 0, 1000);
  if (headerIndex === -1) {
    return [response];
  }

  const headerStr = new TextDecoder().decode(message.slice(0, headerIndex));
  const boundaryString = identifyBoundary(headerStr);
  if (!boundaryString) {
    return [response];
  }

  const boundary = new TextEncoder().encode(boundaryString);
  const components: ArrayBuffer[] = [];
  let offset = headerIndex + separator.length;

  let boundaryIndex = findToken(message, boundary, offset);
  while (boundaryIndex !== -1) {
    const contentStart = findToken(message, separator, boundaryIndex, 1000);
    if (contentStart === -1) {
      break;
    }
    const dataStart = contentStart + separator.length;
    const nextBoundary = findToken(message, boundary, dataStart);
    const dataEnd = nextBoundary === -1 ? message.length : nextBoundary - 2;
    components.push(response.slice(dataStart, dataEnd));
    if (nextBoundary === -1) {
      break;
    }
    offset = nextBoundary;
    boundaryIndex = findToken(message, boundary, offset + boundary.length);
    if (boundaryIndex === -1) {
      break;
    }
  }

  return components.length > 0 ? components : [response];
}

function findToken(
  message: Uint8Array,
  token: Uint8Array,
  startIndex: number,
  maxLength?: number
): number {
  const end = maxLength
    ? Math.min(message.length, startIndex + maxLength)
    : message.length;
  for (let i = startIndex; i < end - token.length + 1; i++) {
    let found = true;
    for (let j = 0; j < token.length; j++) {
      if (message[i + j] !== token[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return -1;
}

function identifyBoundary(header: string): string | null {
  const match = header.match(/boundary=([^\s;]+)/i);
  if (match) {
    return `--${match[1].replace(/"/g, '')}`;
  }
  return null;
}

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
   * Accepts a parsed DICOM WaveformSequence and loads channel data.
   *
   * @param waveformSequence - Parsed WaveformSequence with named properties.
   * @param wadoRsRoot - Optional WADO-RS root URL for BulkDataURI resolution.
   * @param studyUID - Optional Study Instance UID for BulkDataURI path construction.
   */
  public async setEcg(
    waveformSequence: WaveformSequenceInput,
    wadoRsRoot?: string,
    studyUID?: string
  ): Promise<void> {
    const {
      NumberOfWaveformChannels: numberOfChannels,
      NumberOfWaveformSamples: numberOfSamples,
      SamplingFrequency: samplingFrequency,
      WaveformBitsAllocated: bitsAllocated = 16,
      WaveformSampleInterpretation: sampleInterpretation = 'SS',
      MultiplexGroupLabel: multiplexGroupLabel = 'ECG',
      ChannelDefinitionSequence: channelDefinitions = [],
      WaveformData: waveformData,
    } = waveformSequence;

    // Load channel data from InlineBinary or BulkDataURI
    const channelArrays = await this.loadChannelData(
      waveformData,
      numberOfChannels,
      numberOfSamples,
      bitsAllocated,
      sampleInterpretation,
      wadoRsRoot,
      studyUID
    );

    // Build channel descriptors with cached min/max
    this.channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      const channelDef = channelDefinitions[i] || {};
      const name =
        channelDef.ChannelSourceSequence?.CodeMeaning || `Channel ${i + 1}`;
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

    // Calculate ECG width from sample count and frequency
    this.ecgWidth = Math.ceil(
      (numberOfSamples * SECONDS_WIDTH) / samplingFrequency
    );

    this.computeChannelScale();
    this.recalculateHeight();
    this.refreshRenderValues();
    this.renderFrame();
  }

  private async loadChannelData(
    waveformData: WaveformDataSource,
    numberOfChannels: number,
    numberOfSamples: number,
    bits: number,
    type: string,
    wadoRsRoot?: string,
    studyUID?: string
  ): Promise<Int16Array[]> {
    // Method 1: Already decoded Value
    if (waveformData.Value) {
      return waveformData.Value as Int16Array[];
    }

    // Method 2: InlineBinary (base64)
    if (waveformData.InlineBinary) {
      const raw = base64ToUint8Array(waveformData.InlineBinary);
      return convertBuffer(raw, numberOfChannels, numberOfSamples, bits, type);
    }

    // Method 3: retrieveBulkData function
    if (typeof waveformData.retrieveBulkData === 'function') {
      const bulkdata = await waveformData.retrieveBulkData();
      return convertBuffer(
        bulkdata,
        numberOfChannels,
        numberOfSamples,
        bits,
        type
      );
    }

    // Method 4: BulkDataURI
    if (waveformData.BulkDataURI) {
      let url = waveformData.BulkDataURI;
      if (url.indexOf(':') === -1 && wadoRsRoot) {
        url = studyUID
          ? `${wadoRsRoot}/studies/${studyUID}/${url}`
          : `${wadoRsRoot}/${url}`;
      }
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || '';
      const decoded = contentType.includes('multipart')
        ? multipartDecode(buffer)[0]
        : buffer;
      return convertBuffer(
        decoded,
        numberOfChannels,
        numberOfSamples,
        bits,
        type
      );
    }

    console.warn('[ECGViewport] No data source found in WaveformData');
    return [];
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
    const pan: Point2 = this.ecgCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const panOffsetCanvas: Point2 = [
      pan[0] * worldToCanvasRatio,
      pan[1] * worldToCanvasRatio,
    ];

    const subCanvasPos: Point2 = [
      canvasPos[0] - panOffsetCanvas[0],
      canvasPos[1] - panOffsetCanvas[1],
    ];

    destPos.splice(
      0,
      2,
      subCanvasPos[0] / worldToCanvasRatio,
      subCanvasPos[1] / worldToCanvasRatio
    );
    return destPos;
  };

  public worldToCanvas = (worldPos: Point3): Point2 => {
    const pan: Point2 = this.ecgCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    return [
      (worldPos[0] + pan[0]) * worldToCanvasRatio,
      (worldPos[1] + pan[1]) * worldToCanvasRatio,
    ];
  };

  public getPan(): Point2 {
    const panWorld = this.ecgCamera.panWorld;
    return [panWorld[0], panWorld[1]];
  }

  public getRotation = () => 0;

  public getNumberOfSlices = (): number => {
    return 1;
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
   * Returns image data for tool compatibility (e.g. ZoomTool).
   * ECG world coordinates: x = time (world pixels), y = amplitude (world pixels).
   */
  public getImageData() {
    if (!this.waveformData) {
      return null;
    }

    const dimensions = [this.ecgWidth, this.ecgHeight, 1];
    const spacing = [1, 1, 1];
    const origin = [0, 0, 0];
    const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    const imageData = {
      getDirection: () => direction,
      getDimensions: () => dimensions,
      getRange: () => [0, 1] as Point2,
      getSpacing: () => spacing,
      worldToIndex: (point: Point3) => {
        return [point[0], point[1], 0] as Point3;
      },
      indexToWorld: (point: Point3) => {
        return [point[0], point[1], 0] as Point3;
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
