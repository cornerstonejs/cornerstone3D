import { Events as EVENTS } from '../enums';
import type {
  ICamera,
  Point2,
  Point3,
  InternalSlicerCamera,
  SlicerViewportInput,
  SlicerSliceParams,
  SlicerDicomStudy,
  SlicerVolumeGeometry,
  ViewReference,
  ViewReferenceSpecifier,
  ReferenceCompatibleOptions,
} from '../types';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import triggerEvent from '../utilities/triggerEvent';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';

const ORIENTATION_TO_SLICER_VIEW = {
  axial: 'red',
  sagittal: 'yellow',
  coronal: 'green',
} as const;

// The clean approach would be `POST /accessDICOMwebStudy`, but that
// handler is broken in Slicer 5.11 — SlicerRequestHandler.py:670 does
// `request = json.loads(requestBody), b"application/json"` (a tuple)
// and then indexes it as a dict, so every call returns 500. Its CORS
// preflight also only whitelists `Accept`, so setting Content-Type
// fails. We call the equivalent `DICOMUtils.importFromDICOMWeb` via
// /slicer/exec instead — this is Slicer's bundled `dicomweb_client`,
// which does full WADO-RS multipart retrieves (works against real
// PACS like Orthanc, dcm4chee; fails against static CloudFront-style
// endpoints).
const FETCH_DICOMWEB_STUDY_PYTHON = `
import traceback
import slicer
from DICOMLib import DICOMUtils

dicomWebEndpoint = __WADO_RS_ROOT__
studyInstanceUID = __STUDY_UID__
seriesInstanceUID = __SERIES_UID__ or None
accessToken = __ACCESS_TOKEN__ or None

try:
    for existing in slicer.mrmlScene.GetNodesByClass('vtkMRMLScalarVolumeNode'):
        slicer.mrmlScene.RemoveNode(existing)

    # Despite the docstring saying "list of imported study UIDs",
    # importFromDICOMWeb actually returns *series* UIDs (seriesImported
    # in DICOMUtils.py). Pass those straight to loadSeriesByUID — the
    # alternative getLoadablesFromFileLists + loadLoadables path is
    # broken in Slicer 5.11 (returns a tuple that loadLoadables then
    # indexes as a dict).
    seriesUIDs = DICOMUtils.importFromDICOMWeb(
        dicomWebEndpoint=dicomWebEndpoint,
        studyInstanceUID=studyInstanceUID,
        seriesInstanceUID=seriesInstanceUID,
        accessToken=accessToken,
    )

    if not seriesUIDs:
        raise RuntimeError('importFromDICOMWeb returned no series')

    DICOMUtils.loadSeriesByUID(list(seriesUIDs))

    volumes = slicer.mrmlScene.GetNodesByClass('vtkMRMLScalarVolumeNode')
    if volumes.GetNumberOfItems() == 0:
        raise RuntimeError('DICOM import produced no scalar volume')
    volumeNode = volumes.GetItemAsObject(0)

    slicer.util.setSliceViewerLayers(background=volumeNode, fit=True)
    slicer.app.layoutManager().setLayout(
        slicer.vtkMRMLLayoutNode.SlicerLayoutOneUpRedSliceView
    )

    __execResult = {
        'success': True,
        'volumeNodeID': volumeNode.GetID(),
        'volumeName': volumeNode.GetName(),
        'series': list(seriesUIDs),
    }
except Exception as e:
    __execResult = {
        'success': False,
        'error': str(e),
        'traceback': traceback.format_exc(),
    }
`;

const SAMPLE_DATA_PYTHON = `
import slicer
import SampleData
try:
    logic = SampleData.SampleDataLogic()
    loader = getattr(logic, 'download__SAMPLE__', None)
    if loader is None:
        __execResult = {'success': False, 'error': 'Unknown sample: __SAMPLE__'}
    else:
        volumeNode = loader()
        slicer.app.layoutManager().setLayout(
            slicer.vtkMRMLLayoutNode.SlicerLayoutOneUpRedSliceView
        )
        __execResult = {'success': True, 'volumeNodeID': volumeNode.GetID()}
except Exception as e:
    __execResult = {'success': False, 'error': str(e)}
`;

const ENABLE_VOLUME_RENDERING_PYTHON = `
import traceback
try:
    import slicer
    volumes = slicer.mrmlScene.GetNodesByClass('vtkMRMLScalarVolumeNode')
    if volumes.GetNumberOfItems() == 0:
        raise RuntimeError('No volume loaded')
    volumeNode = volumes.GetItemAsObject(0)

    slicer.app.layoutManager().setLayout(
        slicer.vtkMRMLLayoutNode.SlicerLayoutFourUpView
    )

    volRenLogic = slicer.modules.volumerendering.logic()
    displayNode = volRenLogic.GetFirstVolumeRenderingDisplayNode(volumeNode)
    if displayNode is None:
        displayNode = volRenLogic.CreateDefaultVolumeRenderingNodes(volumeNode)
    displayNode.SetVisibility(True)

    presets = volRenLogic.GetPresetsScene().GetNodesByName('CT-AAA')
    if presets.GetNumberOfItems() > 0:
        displayNode.GetVolumePropertyNode().Copy(presets.GetItemAsObject(0))

    lm = slicer.app.layoutManager()
    for i in range(lm.threeDViewCount):
        view = lm.threeDWidget(i).threeDView()
        view.resetFocalPoint()
        view.resetCamera()

    __execResult = {'success': True, 'volume': volumeNode.GetName()}
except Exception as e:
    __execResult = {
        'success': False,
        'error': str(e),
        'traceback': traceback.format_exc(),
    }
`;

const VOLUME_GEOMETRY_PYTHON = `
import slicer
volumeNode = None
for node in slicer.mrmlScene.GetNodesByClass('vtkMRMLScalarVolumeNode'):
    volumeNode = node
    break
if volumeNode is None:
    __execResult = {'error': 'No volume loaded'}
else:
    imageData = volumeNode.GetImageData()
    extent = imageData.GetExtent()
    spacing = volumeNode.GetSpacing()
    origin = volumeNode.GetOrigin()
    bounds = [0.0] * 6
    volumeNode.GetRASBounds(bounds)
    axisIndex = {'axial': 2, 'sagittal': 0, 'coronal': 1}.get('__ORIENTATION__', 2)
    numSlices = extent[axisIndex * 2 + 1] - extent[axisIndex * 2] + 1
    sliceThickness = spacing[axisIndex]
    minOffset = bounds[axisIndex * 2]
    maxOffset = bounds[axisIndex * 2 + 1]
    __execResult = {
        'numberOfSlices': int(numSlices),
        'sliceThickness': float(sliceThickness),
        'minOffset': float(minOffset),
        'maxOffset': float(maxOffset),
    }
`;

/**
 * SlicerViewport renders slice PNGs served by a locally-running 3D Slicer
 * WebServer instance via its `GET /slice` endpoint. It fetches a fresh PNG
 * whenever the slice offset or orientation changes, and applies pan/zoom
 * purely client-side so interaction stays responsive.
 */
class SlicerViewport extends Viewport {
  readonly uid: string;
  readonly renderingEngineId: string;
  readonly canvasContext: CanvasRenderingContext2D;

  private imageElement: HTMLImageElement;
  private serverUrl = 'http://localhost:2016';
  private sliceParams: SlicerSliceParams = {
    view: 'red',
    orientation: 'axial',
    offset: 0,
    size: 512,
  };
  private imgWidth = 0;
  private imgHeight = 0;
  private volumeGeometry: SlicerVolumeGeometry | null = null;
  private currentSliceIndex = 0;
  private renderMode: 'slice' | 'threeD' = 'slice';

  private slicerCamera: InternalSlicerCamera = {
    panWorld: [0, 0],
    parallelScale: 1,
  };

  constructor(props: SlicerViewportInput) {
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

    this.imageElement = document.createElement('img');
    this.imageElement.crossOrigin = 'anonymous';
    this.imageElement.onload = this.handleImageLoaded;
    this.imageElement.onerror = () => {
      console.warn(
        `[SlicerViewport] Failed to fetch slice from ${this.imageElement.src}`
      );
    };

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

  private elementDisabledHandler = () => {
    this.removeEventListeners();
    this.imageElement.onload = null;
    this.imageElement.onerror = null;
  };

  public setServer(url: string): void {
    this.serverUrl = url.replace(/\/+$/, '');
  }

  public getServer(): string {
    return this.serverUrl;
  }

  /**
   * Tells Slicer to fetch the given DICOMweb study. Slicer invokes
   * `DICOMUtils.importFromDICOMWeb` via /slicer/exec, which does full
   * WADO-RS multipart series retrieves — works against real PACS
   * (Orthanc, dcm4chee, etc.). We go through /slicer/exec rather than
   * the more direct /accessDICOMwebStudy endpoint because that handler
   * is broken in current Slicer (see FETCH_DICOMWEB_STUDY_PYTHON above).
   */
  public async loadDicomStudy(study: SlicerDicomStudy): Promise<void> {
    const source = FETCH_DICOMWEB_STUDY_PYTHON.replace(
      '__WADO_RS_ROOT__',
      JSON.stringify(study.wadoRsRoot)
    )
      .replace('__STUDY_UID__', JSON.stringify(study.StudyInstanceUID))
      .replace('__SERIES_UID__', JSON.stringify(study.SeriesInstanceUID ?? ''))
      .replace('__ACCESS_TOKEN__', JSON.stringify(study.accessToken ?? ''));

    const response = await fetch(`${this.serverUrl}/slicer/exec`, {
      method: 'POST',
      body: source,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[SlicerViewport] loadDicomStudy failed (${response.status}): ${text}`
      );
    }
    const result = await response.json();
    if (result && result.success === false) {
      const tb = result.traceback ? `\n${result.traceback}` : '';
      throw new Error(`[SlicerViewport] loadDicomStudy: ${result.error}${tb}`);
    }

    await this.finalizeVolumeLoad();
  }

  /**
   * Loads one of Slicer's built-in `SampleData` volumes (MRHead, CTACardio,
   * CTChest, ...). Handy when the DICOMweb endpoint you have isn't
   * compatible with Slicer's WADO-RS client — no network round-trip to a
   * third party needed.
   */
  public async loadSampleData(sampleName = 'MRHead'): Promise<void> {
    const source = SAMPLE_DATA_PYTHON.replace(/__SAMPLE__/g, sampleName);
    const response = await fetch(`${this.serverUrl}/slicer/exec`, {
      method: 'POST',
      body: source,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[SlicerViewport] loadSampleData failed (${response.status}): ${text}`
      );
    }
    const result = await response.json();
    if (result && result.success === false) {
      throw new Error(`[SlicerViewport] loadSampleData: ${result.error}`);
    }
    await this.finalizeVolumeLoad();
  }

  private async finalizeVolumeLoad(): Promise<void> {
    if (this.renderMode === 'threeD') {
      // 3D view has no slice geometry — just fetch the current frame.
      this.fetchAndRender();
      return;
    }
    this.volumeGeometry = await this.queryVolumeGeometry();
    this.currentSliceIndex = Math.floor(this.volumeGeometry.numberOfSlices / 2);
    this.sliceParams.offset =
      this.volumeGeometry.minOffset +
      this.currentSliceIndex * this.volumeGeometry.sliceThickness;
    this.fetchAndRender();
  }

  /**
   * Re-queries Slicer for the currently-loaded volume's geometry along
   * this viewport's orientation, recentres the slice index, and fetches
   * a fresh PNG. Use this on secondary viewports in a multi-viewport
   * layout: only one viewport should call `loadDicomStudy` (which is a
   * scene-wide import), and the rest call `syncFromSlicer` to pick up
   * the now-loaded volume without re-importing.
   */
  public async syncFromSlicer(): Promise<void> {
    await this.finalizeVolumeLoad();
  }

  /**
   * Switches this viewport between slice rendering (`/slicer/slice`) and
   * 3D volume rendering (`/slicer/threeD`). In 3D mode, scrolling and
   * orientation are no-ops; the image comes from Slicer's 3D widget,
   * which requires a volume-rendering display node to be present on the
   * scene — call `enableVolumeRendering` once after loading the study.
   */
  public setRenderMode(mode: 'slice' | 'threeD'): void {
    this.renderMode = mode;
  }

  /**
   * Enables volume rendering on the first loaded scalar volume and
   * applies the CT-AAA preset. Call this once after `loadDicomStudy`
   * so any viewport set to 3D mode has something to render. Also
   * switches Slicer's layout to four-up so the 3D widget is populated.
   */
  public async enableVolumeRendering(): Promise<void> {
    const response = await fetch(`${this.serverUrl}/slicer/exec`, {
      method: 'POST',
      body: ENABLE_VOLUME_RENDERING_PYTHON,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[SlicerViewport] enableVolumeRendering failed (${response.status}): ${text}`
      );
    }
    const result = await response.json();
    if (result && result.success === false) {
      const tb = result.traceback ? `\n${result.traceback}` : '';
      throw new Error(
        `[SlicerViewport] enableVolumeRendering: ${result.error}${tb}`
      );
    }
  }

  /**
   * Runs a small Python snippet on Slicer's interpreter to read the
   * loaded volume's extent, spacing, and bounds along the axis matching
   * the current orientation.
   */
  private async queryVolumeGeometry(): Promise<SlicerVolumeGeometry> {
    const orientation = this.sliceParams.orientation ?? 'axial';
    const source = VOLUME_GEOMETRY_PYTHON.replace(
      '__ORIENTATION__',
      orientation
    );
    const response = await fetch(`${this.serverUrl}/slicer/exec`, {
      method: 'POST',
      body: source,
    });
    if (!response.ok) {
      throw new Error(
        `[SlicerViewport] /slicer/exec failed: ${response.status}. ` +
          `Is "Slicer API exec" enabled in the Web Server module?`
      );
    }
    const result = await response.json();
    if (result.error) {
      throw new Error(`[SlicerViewport] ${result.error}`);
    }
    return {
      numberOfSlices: result.numberOfSlices,
      sliceThickness: result.sliceThickness,
      minOffset: result.minOffset,
      maxOffset: result.maxOffset,
    };
  }

  public getVolumeGeometry(): SlicerVolumeGeometry | null {
    return this.volumeGeometry;
  }

  /**
   * Moves to a sibling slice. `delta` is a signed integer in slices; the
   * StackScrollTool calls this with +/-1 per wheel tick.
   */
  public scroll = (delta = 1): void => {
    if (!this.volumeGeometry) {
      return;
    }
    const { numberOfSlices, minOffset, sliceThickness } = this.volumeGeometry;
    const next = Math.max(
      0,
      Math.min(numberOfSlices - 1, this.currentSliceIndex + delta)
    );
    if (next === this.currentSliceIndex) {
      return;
    }
    this.currentSliceIndex = next;
    this.sliceParams.offset = minOffset + next * sliceThickness;
    this.fetchAndRender();
    triggerEvent(this.element, EVENTS.STACK_NEW_IMAGE, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
      imageId: this.getCurrentImageId(),
      imageIdIndex: this.currentSliceIndex,
    });
  };

  public setSliceParams(params: Partial<SlicerSliceParams>): Promise<void> {
    const orientationChanged =
      params.orientation !== undefined &&
      params.orientation !== this.sliceParams.orientation;

    this.sliceParams = { ...this.sliceParams, ...params };

    if (params.orientation !== undefined) {
      this.sliceParams.view = ORIENTATION_TO_SLICER_VIEW[params.orientation];
    }

    if (orientationChanged) {
      return this.queryVolumeGeometry().then((geom) => {
        this.volumeGeometry = geom;
        this.currentSliceIndex = Math.floor(geom.numberOfSlices / 2);
        this.sliceParams.offset =
          geom.minOffset + this.currentSliceIndex * geom.sliceThickness;
        this.fetchAndRender();
      });
    }
    this.fetchAndRender();
    return Promise.resolve();
  }

  public getSliceParams(): SlicerSliceParams {
    return { ...this.sliceParams };
  }

  private buildSliceUrl(): string {
    const params = new URLSearchParams();
    if (this.renderMode === 'threeD') {
      if (this.sliceParams.size) {
        params.set('size', String(this.sliceParams.size));
      }
      params.set('_t', String(Date.now()));
      return `${this.serverUrl}/slicer/threeD?${params.toString()}`;
    }
    const { view, orientation, offset, size } = this.sliceParams;
    if (view) {
      params.set('view', view);
    }
    if (orientation) {
      params.set('orientation', orientation);
    }
    if (offset !== undefined) {
      params.set('offset', String(offset));
    }
    if (size) {
      params.set('size', String(size));
    }
    params.set('_t', String(Date.now()));
    return `${this.serverUrl}/slicer/slice?${params.toString()}`;
  }

  private fetchAndRender(): void {
    this.imageElement.src = this.buildSliceUrl();
  }

  private handleImageLoaded = (): void => {
    this.imgWidth = this.imageElement.naturalWidth;
    this.imgHeight = this.imageElement.naturalHeight;
    if (!this.imgWidth || !this.imgHeight) {
      return;
    }
    this.refreshRenderValues();
    this.renderFrame();
  };

  /**
   * Converts a canvas coordinate to world. Z is the current slice index so
   * annotation tools can tag points with the slice they were drawn on.
   */
  public canvasToWorld = (
    canvasPos: Point2,
    destPos: Point3 = [0, 0, 0]
  ): Point3 => {
    const pan: Point2 = this.slicerCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const panOffsetCanvas: Point2 = [
      pan[0] * worldToCanvasRatio,
      pan[1] * worldToCanvasRatio,
    ];

    const subCanvasPos: Point2 = [
      canvasPos[0] - panOffsetCanvas[0],
      canvasPos[1] - panOffsetCanvas[1],
    ];

    destPos[0] = subCanvasPos[0] / worldToCanvasRatio;
    destPos[1] = subCanvasPos[1] / worldToCanvasRatio;
    destPos[2] = this.currentSliceIndex;
    return destPos;
  };

  public worldToCanvas = (worldPos: Point3): Point2 => {
    const pan: Point2 = this.slicerCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    return [
      (worldPos[0] + pan[0]) * worldToCanvasRatio,
      (worldPos[1] + pan[1]) * worldToCanvasRatio,
    ];
  };

  public getRotation = () => 0;

  public getNumberOfSlices = (): number => {
    return this.volumeGeometry?.numberOfSlices ?? 1;
  };

  public getCurrentImageIdIndex = (): number => {
    return this.currentSliceIndex;
  };

  public getSliceIndex = (): number => {
    return this.currentSliceIndex;
  };

  public getCurrentImageId = (): string => {
    const orientation = this.sliceParams.orientation ?? 'axial';
    return `slicer:${this.serverUrl}:${orientation}:${this.currentSliceIndex}`;
  };

  public getImageIds = (): string[] => {
    const n = this.getNumberOfSlices();
    const orientation = this.sliceParams.orientation ?? 'axial';
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(`slicer:${this.serverUrl}:${orientation}:${i}`);
    }
    return ids;
  };

  public getFrameOfReferenceUID = (): string => {
    const orientation = this.sliceParams.orientation ?? 'axial';
    return `slicer-${this.id}-${orientation}`;
  };

  // BaseTool.getTargetImageData splits on "imageId:" to find the viewport
  // that owns the target image. Without the prefix, annotation tools
  // (LengthTool, etc.) throw before they can read cachedStats.
  public getViewReferenceId(specifier?: ViewReferenceSpecifier): string {
    const sliceIndex = specifier?.sliceIndex ?? this.currentSliceIndex;
    const orientation = this.sliceParams.orientation ?? 'axial';
    return `imageId:slicer:${this.serverUrl}:${orientation}:${sliceIndex}`;
  }

  public hasImageURI(imageURI: string): boolean {
    return this.getCurrentImageId().includes(imageURI);
  }

  /**
   * Only show annotations whose slice matches the current slice (so they
   * don't bleed across slices). Mirrors `ECGViewport.isReferenceViewable`.
   */
  public isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    if (
      viewRef.FrameOfReferenceUID &&
      viewRef.FrameOfReferenceUID !== this.getFrameOfReferenceUID()
    ) {
      return false;
    }
    if (options.withNavigation) {
      return true;
    }
    if (typeof viewRef.sliceIndex === 'number') {
      return viewRef.sliceIndex === this.currentSliceIndex;
    }
    return true;
  }

  public setCamera(camera: ICamera): void {
    const { parallelScale, focalPoint } = camera;

    if (parallelScale) {
      this.slicerCamera.parallelScale =
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
          this.slicerCamera.parallelScale,
        (focalPointCanvas[1] - canvasCenter[1]) /
          this.slicerCamera.parallelScale,
      ];

      this.slicerCamera.panWorld = [
        this.slicerCamera.panWorld[0] - panWorldDelta[0],
        this.slicerCamera.panWorld[1] - panWorldDelta[1],
      ];
    }

    this.canvasContext.fillStyle = 'rgba(0,0,0,1)';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderFrame();

    triggerEvent(this.element, EVENTS.CAMERA_MODIFIED, {
      previousCamera: camera,
      camera: this.getCamera(),
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      rotation: this.getRotation(),
    });
  }

  public getCamera(): ICamera {
    const { parallelScale } = this.slicerCamera;

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
    this.canvasContext.fillStyle = 'rgba(0,0,0,1)';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderFrame();
    return true;
  };

  /**
   * Minimal IImageData-ish object for tools that want the viewport's
   * image extent + spacing (e.g. ZoomTool's zoom-cap math). The pixels
   * live in Slicer; on the browser side we only know the current
   * slice's PNG size and the volume's slice count / thickness from the
   * last geometry query, which is enough for those tools. Returns null
   * until the first slice has been fetched.
   */
  public getImageData() {
    if (!this.imgWidth || !this.imgHeight) {
      return null;
    }
    const numberOfSlices = this.volumeGeometry?.numberOfSlices ?? 1;
    const sliceThickness = this.volumeGeometry?.sliceThickness ?? 1;
    const dimensions: Point3 = [this.imgWidth, this.imgHeight, numberOfSlices];
    const spacing: Point3 = [1, 1, sliceThickness];
    const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const origin: Point3 = [0, 0, 0];
    const imageData = {
      getDimensions: () => dimensions,
      getSpacing: () => spacing,
      getDirection: () => direction,
      getOrigin: () => origin,
      getRange: () => [0, 255] as Point2,
      worldToIndex: (point: Point3): Point3 => {
        const canvasPoint = this.worldToCanvas(point);
        return [canvasPoint[0], canvasPoint[1], this.currentSliceIndex];
      },
      indexToWorld: (point: Point3): Point3 =>
        this.canvasToWorld([point[0], point[1]]),
    };
    return {
      dimensions,
      spacing,
      direction,
      origin,
      imageData,
      metadata: {
        Modality: '',
        FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      },
      hasPixelSpacing: false,
    };
  }

  public getProperties = () => {
    return {};
  };

  public setProperties(): void {
    // No-op — Slicer renders the slice with its own window/level.
  }

  public resetProperties(): void {
    // No-op.
  }

  public updateCameraClippingPlanesAndRange(): void {
    // No-op.
  }

  public updateRenderingPipeline = (): void => {
    this.renderFrame();
  };

  public resize = (): void => {
    const canvas = this.canvas;
    const { clientWidth, clientHeight } = canvas;

    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    this.refreshRenderValues();
    this.renderFrame();
  };

  private refreshRenderValues() {
    if (!this.imgWidth || !this.imgHeight) {
      return;
    }

    let worldToCanvasRatio = this.canvas.offsetWidth / this.imgWidth;
    if (this.imgHeight * worldToCanvasRatio > this.canvas.offsetHeight) {
      worldToCanvasRatio = this.canvas.offsetHeight / this.imgHeight;
    }

    const drawWidth = Math.floor(this.imgWidth * worldToCanvasRatio);
    const drawHeight = Math.floor(this.imgHeight * worldToCanvasRatio);

    const xOffsetCanvas = (this.canvas.offsetWidth - drawWidth) / 2;
    const yOffsetCanvas = (this.canvas.offsetHeight - drawHeight) / 2;

    const xOffsetWorld = xOffsetCanvas / worldToCanvasRatio;
    const yOffsetWorld = yOffsetCanvas / worldToCanvasRatio;

    this.slicerCamera.panWorld = [xOffsetWorld, yOffsetWorld];
    this.slicerCamera.parallelScale = worldToCanvasRatio;
  }

  private getWorldToCanvasRatio() {
    return this.slicerCamera.parallelScale;
  }

  private getCanvasToWorldRatio() {
    return 1.0 / this.slicerCamera.parallelScale;
  }

  public customRenderViewportToCanvas = () => {
    this.renderFrame();
  };

  protected getTransform() {
    const panWorld: Point2 = this.slicerCamera.panWorld;
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

    transform.scale(devicePixelRatio, devicePixelRatio);
    transform.translate(halfCanvas[0], halfCanvas[1]);
    transform.scale(worldToCanvasRatio, worldToCanvasRatio);
    transform.translate(panWorld[0], panWorld[1]);
    transform.translate(
      -halfCanvasWorldCoordinates[0],
      -halfCanvasWorldCoordinates[1]
    );
    return transform;
  }

  private renderFrame = () => {
    if (!this.imgWidth || !this.imgHeight) {
      this.canvasContext.fillStyle = 'rgba(0,0,0,1)';
      this.canvasContext.fillRect(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const transform = this.getTransform();
    const m: number[] = transform.getMatrix();
    const ctx = this.canvasContext;

    ctx.resetTransform();
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(
      m[0] / dpr,
      m[1] / dpr,
      m[2] / dpr,
      m[3] / dpr,
      m[4] / dpr,
      m[5] / dpr
    );

    ctx.drawImage(this.imageElement, 0, 0, this.imgWidth, this.imgHeight);

    ctx.resetTransform();
    this.setRendered();

    triggerEvent(this.element, EVENTS.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
    });
  };
}

export default SlicerViewport;
