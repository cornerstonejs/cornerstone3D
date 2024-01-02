import { vec3 } from 'gl-matrix';
import { Events as EVENTS, MetadataModules } from '../enums';
import {
  IWSIViewport,
  WSIViewportProperties,
  Point3,
  Point2,
  ICamera,
  WSIViewportInput,
  VOIRange,
} from '../types';
import * as metaData from '../metaData';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';
import { EPSILON } from '../constants';

const _map = Symbol.for('map');

/**
 * An object representing a single stack viewport, which is a camera
 * looking into an internal scene, and an associated target output `canvas`.
 */
class WSIViewport extends Viewport implements IWSIViewport {
  public modality;
  // Viewport Data
  protected imageIds: string[];
  readonly uid;
  readonly renderingEngineId: string;

  private frameOfReferenceUID: string;

  // First is some specific metadata on the current image
  protected metadata;
  // Then the metadata array containing the dicomweb metadata definitions
  protected metadataDicomweb;

  private microscopyElement: HTMLDivElement;

  private internalCamera = {
    worldToCanvasRatio: 1,
    rotation: 0,
    centerWorld: vec3.create() as Point3,
    focalPoint: vec3.create() as Point3,
    extent: [0, -2, 1, -1],
    panWorld: [0, 0],
    xSpacing: 1,
    ySpacing: 1,
  };

  private viewer;

  /**
   * The VOI Range is used to apply contrast/brightness adjustments to the image.
   */
  private voiRange: VOIRange = {
    lower: 0,
    upper: 255,
  };

  constructor(props: WSIViewportInput) {
    super({
      ...props,
      canvas: props.canvas || getOrCreateCanvas(props.element),
    });
    this.renderingEngineId = props.renderingEngineId;

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    // Need to set the top level position as relative to make nested items
    // use absolute positioning internally.
    this.element.style.position = 'relative';
    this.microscopyElement = document.createElement('div');
    this.microscopyElement.id = crypto.randomUUID();
    this.microscopyElement.innerText = 'Initial';
    this.microscopyElement.style.background = 'grey';
    this.microscopyElement.style.width = '100%';
    this.microscopyElement.style.height = '100%';
    this.microscopyElement.style.position = 'absolute';
    this.microscopyElement.style.left = '0';
    this.microscopyElement.style.top = '0';
    const cs3dElement = this.element.firstElementChild;
    cs3dElement.insertBefore(this.microscopyElement, cs3dElement.childNodes[1]);

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

  private _getImageDataMetadata(imageIndex = 0) {
    const columns = Math.max(
      ...this.metadataDicomweb.map((image) => image.TotalPixelMatrixColumns)
    );
    const rows = Math.max(
      ...this.metadataDicomweb.map((image) => image.TotalPixelMatrixRows)
    );
    const {
      ImagedVolumeWidth: width,
      ImagedVolumeHeight: height,
      ImagedVolumeDepth: depth,
    } = this.metadataDicomweb[0];

    const imagePlaneModule = metaData.get(
      MetadataModules.IMAGE_PLANE,
      this.imageIds[imageIndex]
    );

    let rowCosines = <Point3>imagePlaneModule.rowCosines;
    let columnCosines = <Point3>imagePlaneModule.columnCosines;

    // if null or undefined
    if (rowCosines == null || columnCosines == null) {
      rowCosines = <Point3>[1, 0, 0];
      columnCosines = <Point3>[0, 1, 0];
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
    const scanAxisNormal = vec3.create();
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

    let origin = imagePlaneModule.imagePositionPatient;
    if (!origin) {
      origin = [0, 0, 0];
    }

    const xSpacing = width / columns;
    const ySpacing = height / rows;
    const xVoxels = columns;
    const yVoxels = rows;

    const zSpacing = depth;
    const zVoxels = 1;

    this.hasPixelSpacing = !!(width && height);
    return {
      bitsAllocated: 8,
      numComps: 3,
      origin,
      direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal],
      dimensions: [xVoxels, yVoxels, zVoxels],
      spacing: [xSpacing, ySpacing, zSpacing],
      hasPixelSpacing: this.hasPixelSpacing,
      numVoxels: xVoxels * yVoxels * zVoxels,
      imagePlaneModule,
    };
  }

  // Sets the frame number - note according to DICOM, this is 1 based
  public async setFrameNumber(frame: number) {
    // No-op right now, not sure what this will be
  }

  public setProperties(props: WSIViewportProperties) {
    // No-op - todo implement this
  }

  public getProperties = (): WSIViewportProperties => {
    return {};
  };

  public resetProperties() {
    this.setProperties({});
  }

  protected getScalarData() {
    return null;
  }

  public getImageData() {
    const { metadata } = this;

    const spacing = metadata.spacing;

    return {
      dimensions: metadata.dimensions,
      spacing,
      origin: metadata.origin,
      direction: metadata.direction,
      metadata: { Modality: this.modality },
      getScalarData: () => this.getScalarData(),
      imageData: {
        getDirection: () => metadata.direction,
        getDimensions: () => metadata.dimensions,
        getRange: () => [0, 255],
        getScalarData: () => this.getScalarData(),
        getSpacing: () => metadata.spacing,
        worldToIndex: (point: Point3) => {
          const canvasPoint = this.worldToCanvas(point);
          const pixelCoord = this.canvasToIndex(canvasPoint);
          return [pixelCoord[0], pixelCoord[1], 0];
        },
        indexToWorld: (point: Point3) => {
          const canvasPoint = this.indexToCanvas([point[0], point[1]]);
          return this.canvasToWorld(canvasPoint);
        },
      },
      hasPixelSpacing: this.hasPixelSpacing,
      calibration: this.calibration,
      preScale: {
        scaled: false,
      },
    };
  }

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
  public hasImageURI(imageURI: string) {
    // TODO - implement this
    return true;
  }

  public setCamera(camera: ICamera): void {
    const { parallelScale, focalPoint } = camera;
    const view = this.getView();
    this.refreshRenderValues();
    const { xSpacing, ySpacing, extent } = this.internalCamera;

    if (parallelScale) {
      const worldToCanvasRatio = this.element.clientHeight / 2 / parallelScale;
      const resolution = 1 / xSpacing / worldToCanvasRatio;

      view.setResolution(resolution);
    }

    if (focalPoint) {
      const newCenter = [
        extent[0] - focalPoint[0] / xSpacing,
        focalPoint[1] / ySpacing + extent[1],
      ];
      view.setCenter(newCenter);
    }
    this.refreshRenderValues();
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
    return this.imageIds[0];
  }

  public getFrameNumber() {
    return 1;
  }

  public getCamera(): ICamera {
    this.refreshRenderValues();

    const { worldToCanvasRatio, focalPoint } = this.internalCamera;

    const canvasCenter: Point2 = [
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ];

    // All other viewports have the focal point in canvas coordinates in the center
    // of the canvas, so to make tools work the same, we need to do the same here
    // and convert to the world coordinate system since focal point is in world coordinates.
    const view = this.getView();
    if (!view) {
      return null;
    }
    const canvasCenterWorld = this.canvasToWorld(canvasCenter);

    return {
      parallelProjection: true,
      focalPoint,
      position: canvasCenterWorld,
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight / 2 / worldToCanvasRatio, // Reverse zoom direction back
      viewPlaneNormal: [0, 0, 1],
    };
  }

  public resetCamera = (): boolean => {
    return true;
  };

  public getNumberOfSlices = (): number => {
    return 1;
  };

  public getFrameOfReferenceUID = (): string => {
    return this.frameOfReferenceUID;
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
  };

  /**
   * Converts a VideoViewport canvas coordinate to a video coordinate.
   *
   * @param canvasPosition - to convert to world
   * @returns World position
   */
  public canvasToWorld = (canvasPosition: Point2): Point3 => {
    const { focalPoint, worldToCanvasRatio } = this.internalCamera;

    const centerRelativeCanvas = [
      canvasPosition[0] - this.canvas.offsetWidth / 2,
      canvasPosition[1] - this.canvas.offsetHeight / 2,
    ];
    const centerRelativeWorld = vec3.fromValues(
      centerRelativeCanvas[0] / worldToCanvasRatio,
      centerRelativeCanvas[1] / worldToCanvasRatio,
      0
    );
    const worldPos = vec3.add(vec3.create(), centerRelativeWorld, focalPoint);
    return [worldPos[0], worldPos[1], worldPos[2]];
  };

  /**
   * Converts and [x,y] video coordinate to a Cornerstone3D VideoViewport.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const { focalPoint, worldToCanvasRatio } = this.internalCamera;

    const centerRelativeWorld = vec3.sub(vec3.create(), worldPos, focalPoint);
    const centerRelativeCanvas = vec3.scale(
      vec3.create(),
      centerRelativeWorld,
      worldToCanvasRatio
    );
    const canvasPosition = [
      this.canvas.offsetWidth / 2 - centerRelativeCanvas[0],
      this.canvas.offsetHeight / 2 - centerRelativeCanvas[1],
    ];

    return canvasPosition as Point2;
  };

  public async setWSI(imageIds: string[], client) {
    this.microscopyElement.style.background = 'red';
    this.microscopyElement.innerText = 'Loading';
    this.imageIds = imageIds;
    const DicomMicroscopyViewer = await import('dicom-microscopy-viewer');
    this.frameOfReferenceUID = null;

    const metadataDicomweb = this.imageIds.map((imageId) => {
      const imageMetadata = client.getDICOMwebMetadata(imageId);

      Object.defineProperty(imageMetadata, 'isMultiframe', {
        value: imageMetadata.isMultiframe,
        enumerable: false,
      });
      Object.defineProperty(imageMetadata, 'frameNumber', {
        value: undefined,
        enumerable: false,
      });
      const imageType = imageMetadata['00080008']?.Value;
      if (imageType?.length === 1) {
        imageMetadata['00080008'].Value = imageType[0].split('\\');
      }
      const frameOfReference = imageMetadata['00200052']?.Value?.[0];
      if (!this.frameOfReferenceUID) {
        this.frameOfReferenceUID = frameOfReference;
      } else if (frameOfReference !== this.frameOfReferenceUID) {
        imageMetadata['00200052'].Value = [this.frameOfReferenceUID];
      }

      return imageMetadata;
    });
    const volumeImages = [];
    metadataDicomweb.forEach((m) => {
      const image =
        new DicomMicroscopyViewer.metadata.VLWholeSlideMicroscopyImage({
          metadata: m,
        });
      const imageFlavor = image.ImageType[2];
      if (imageFlavor === 'VOLUME' || imageFlavor === 'THUMBNAIL') {
        volumeImages.push(image);
      }
    });
    this.metadataDicomweb = volumeImages;

    // Construct viewer instance
    const viewer = new DicomMicroscopyViewer.viewer.VolumeImageViewer({
      client,
      metadata: volumeImages,
      controls: [],
      bindings: {},
    });

    // Render viewer instance in the "viewport" HTML element
    viewer.render({ container: this.microscopyElement });

    this.metadata = this._getImageDataMetadata();

    viewer.deactivateDragPanInteraction();
    this.viewer = viewer;
    this.resize();
    this.microscopyElement.style.background = 'green';
    this.microscopyElement.innerText = '';
  }

  public getPan(): Point2 {
    const worldPan = this.internalCamera.panWorld;
    return [worldPan[0], worldPan[1]];
  }

  public getRotation = () => 0;

  protected canvasToIndex = (canvasPos: Point2): Point2 => {
    const transform = this.getTransform();
    transform.invert();
    return transform.transformPoint(canvasPos);
  };

  protected indexToCanvas = (indexPos: Point2): Point2 => {
    const transform = this.getTransform();
    return transform.transformPoint(indexPos);
  };

  getView() {
    if (!this.viewer) {
      return;
    }
    // TODO - use a native method rather than accessing internals directly
    const map = this.viewer[_map];
    // TODO - remove the globals setter
    const anyWindow = window as unknown as Record<string, unknown>;
    anyWindow.map = map;
    anyWindow.viewer = this.viewer;
    anyWindow.view = map?.getView();
    anyWindow.wsi = this;
    return map?.getView();
  }

  private refreshRenderValues() {
    const view = this.getView();
    if (!view) {
      console.log("No view yet, can't update render values");
      return;
    }
    const resolution = view.getResolution();
    if (!resolution || resolution < EPSILON) {
      return;
    }
    // The location of the center right now
    const center = view.getCenter();
    const extent = view.getProjection().getExtent();

    const {
      metadata: {
        spacing: [xSpacing, ySpacing],
      },
    } = this;

    // this means that each unit (pixel) in the world (video) would be
    // represented by n pixels in the canvas.
    const worldToCanvasRatio = 1 / resolution / xSpacing;

    const centerX = (extent[0] + extent[2]) / 2;
    const centerY = (extent[1] + extent[3]) / 2;
    const focalPoint = vec3.fromValues(
      (extent[0] - center[0]) * xSpacing,
      (center[1] - extent[1]) * ySpacing,
      0
    );

    this.internalCamera.extent = extent;
    this.internalCamera.focalPoint = focalPoint as Point3;
    this.internalCamera.worldToCanvasRatio = worldToCanvasRatio;
    this.internalCamera.centerWorld = [
      centerX * xSpacing,
      centerY * ySpacing,
      0,
    ];
    this.internalCamera.xSpacing = xSpacing;
    this.internalCamera.ySpacing = ySpacing;
  }

  public customRenderViewportToCanvas = () => {
    // console.log('TODO - custom render');
  };

  public getZoom() {
    return this.getView()?.getZoom();
  }

  public setZoom(zoom: number) {
    this.getView()?.setZoom(zoom);
    this.refreshRenderValues();
  }

  protected getTransform() {
    this.refreshRenderValues();
    const { focalPoint, worldToCanvasRatio, xSpacing, ySpacing } =
      this.internalCamera;

    const halfCanvas = [this.canvas.width / 2, this.canvas.height / 2];
    const transform = new Transform();

    // Translate to the center of the canvas (move origin of the transform
    // to the center of the canvas)
    transform.translate(halfCanvas[0], halfCanvas[1]);

    // Scale
    transform.scale(
      // 1 / worldToCanvasRatio / xSpacing,
      // 1 / worldToCanvasRatio / ySpacing
      worldToCanvasRatio * xSpacing,
      worldToCanvasRatio * ySpacing
    );

    // Translate back
    transform.translate(-focalPoint[0] / xSpacing, -focalPoint[1] / ySpacing);
    return transform;
  }

  public getTargetId(): string {
    return `imageId:${this.getCurrentImageId()}`;
  }
}

export default WSIViewport;
