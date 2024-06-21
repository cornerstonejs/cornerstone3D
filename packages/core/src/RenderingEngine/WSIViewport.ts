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
import { triggerEvent } from '../utilities';

const _map = Symbol.for('map');
const EVENT_POSTRENDER = 'postrender';
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

  protected map;

  private internalCamera = {
    rotation: 0,
    centerIndex: [0, 0],
    extent: [0, -2, 1, -1],
    xSpacing: 1,
    ySpacing: 1,
    resolution: 1,
    zoom: 1,
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

  private getImageDataMetadata(imageIndex = 0) {
    const maxImage = this.metadataDicomweb.reduce((maxImage, image) => {
      return maxImage?.NumberOfFrames < image.NumberOfFrames ? image : maxImage;
    });
    const {
      TotalPixelMatrixColumns: columns,
      TotalPixelMatrixRows: rows,
      ImageOrientationSlide,
      ImagedVolumeWidth: width,
      ImagedVolumeHeight: height,
      ImagedVolumeDepth: depth,
    } = maxImage;

    const imagePlaneModule = metaData.get(
      MetadataModules.IMAGE_PLANE,
      this.imageIds[imageIndex]
    );

    let rowCosines = ImageOrientationSlide.slice(0, 3);
    let columnCosines = ImageOrientationSlide.slice(3, 6);

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

    const {
      XOffsetInSlideCoordinateSystem = 0,
      YOffsetInSlideCoordinateSystem = 0,
      ZOffsetInSlideCoordinateSystem = 0,
    } = maxImage.TotalPixelMatrixOriginSequence?.[0] || {};
    const origin = [
      XOffsetInSlideCoordinateSystem,
      YOffsetInSlideCoordinateSystem,
      ZOffsetInSlideCoordinateSystem,
    ];

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
      numComps: 3,
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
    const previousCamera = this.getCamera();
    const { parallelScale, focalPoint } = camera;
    const view = this.getView();
    const { xSpacing } = this.internalCamera;

    if (parallelScale) {
      const worldToCanvasRatio = this.element.clientHeight / parallelScale;
      const resolution = 1 / xSpacing / worldToCanvasRatio;

      view.setResolution(resolution);
    }

    if (focalPoint) {
      const newCanvas = this.worldToCanvas(focalPoint);
      const newIndex = this.canvasToIndex(newCanvas);
      view.setCenter(newIndex);
    }
    const updatedCamera = this.getCamera();
    this.triggerCameraModifiedEventIfNecessary(previousCamera, updatedCamera);
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
    const { resolution, xSpacing } = this.internalCamera;
    const canvasToWorldRatio = resolution * xSpacing;

    const canvasCenter: Point2 = [
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ];
    const focalPoint = this.canvasToWorld(canvasCenter);

    return {
      parallelProjection: true,
      focalPoint,
      position: focalPoint,
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight * canvasToWorldRatio, // Reverse zoom direction back
      viewPlaneNormal: [0, 0, 1],
    };
  }

  public resetCamera = (): boolean => {
    return true;
  };

  /**
   * Gets the number of slices -  this will be the number of focal planes,
   * and not hte actual number of slices in the image sets.
   */
  public getNumberOfSlices = (): number => {
    return 1;
  };

  /**
   * Need to return this as a function to prevent webpack from munging it.
   */
  private getImportPath() {
    return '/dicom-microscopy-viewer/dicomMicroscopyViewer.min.js';
  }

  /**
   * The FOR for whole slide imaging is the frame of reference in the DICOM
   * metadata, and should be the same for all slices being viewed.
   */
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
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    if (!this.metadata) {
      return;
    }
    // compute the pixel coordinate in the image
    const [px, py] = this.canvasToIndex(canvasPos);
    // convert pixel coordinate to world coordinate
    const { origin, spacing, direction } = this.getImageData();

    const worldPos = vec3.fromValues(0, 0, 0);

    // Calculate size of spacing vector in normal direction
    const iVector = direction.slice(0, 3) as Point3;
    const jVector = direction.slice(3, 6) as Point3;

    // Calculate the world coordinate of the pixel
    vec3.scaleAndAdd(worldPos, origin, iVector, px * spacing[0]);
    vec3.scaleAndAdd(worldPos, worldPos, jVector, py * spacing[1]);

    return [worldPos[0], worldPos[1], worldPos[2]] as Point3;
  };

  /**
   * Converts and [x,y] video coordinate to a Cornerstone3D VideoViewport.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    if (!this.metadata) {
      return;
    }
    const { spacing, direction, origin } = this.metadata;

    const iVector = direction.slice(0, 3) as Point3;
    const jVector = direction.slice(3, 6) as Point3;

    const diff = vec3.subtract([0, 0, 0], worldPos, origin);

    const indexPoint: Point2 = [
      vec3.dot(diff, iVector) / spacing[0],
      vec3.dot(diff, jVector) / spacing[1],
    ];

    // pixel to canvas
    const canvasPoint = this.indexToCanvas(indexPoint);
    return canvasPoint;
  };

  /**
   * This is a wrapper for setWSI to allow generic behaviour
   */
  public setDataIds(imageIds: string[]) {
    const webClient = metaData.get(MetadataModules.WEB_CLIENT, imageIds[0]);
    if (!webClient) {
      throw new Error(
        `To use setDataIds on WSI data, you must provide metaData.webClient for ${imageIds[0]}`
      );
    }

    this.setWSI(imageIds, webClient);
  }

  public async setWSI(imageIds: string[], client) {
    this.microscopyElement.style.background = 'red';
    this.microscopyElement.innerText = 'Loading';
    this.imageIds = imageIds;
    // Import the straight module so that webpack doesn't touch it.
    await import(/* webpackIgnore: true */ this.getImportPath());
    const DicomMicroscopyViewer = (window as any).dicomMicroscopyViewer;
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

    this.metadata = this.getImageDataMetadata();

    viewer.deactivateDragPanInteraction();
    this.viewer = viewer;
    this.map = viewer[_map];
    this.map.on(EVENT_POSTRENDER, this.postrender);
    this.resize();
    this.microscopyElement.innerText = '';
    Object.assign(this.microscopyElement.style, {
      '--ol-partial-background-color': 'rgba(127, 127, 127, 0.7)',
      '--ol-foreground-color': '#000000',
      '--ol-subtle-foreground-color': '#000',
      '--ol-subtle-background-color': 'rgba(78, 78, 78, 0.5)',
      background: 'none',
    });
  }

  public postrender = () => {
    this.refreshRenderValues();
    triggerEvent(this.element, EVENTS.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
    });
  };

  /**
   * Scrolls the image - for WSI, this changes the zoom ratio since different
   * images are used to represent different zoom levels, although this also
   * allows fractional zoom levels
   */
  public scroll(delta: number) {
    const camera = this.getCamera();
    this.setCamera({
      parallelScale: camera.parallelScale * (1 + 0.1 * delta),
    });
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

  /** This can be implemented later when multi-slice WSI is supported */
  public getSliceIndex() {
    return 0;
  }

  /**
   * Gets the internal OpenLayers view object being rendered
   * Note this is not typeds right now, but might add typing later.
   */
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

  /**
   * Updates the internal camera rendering values from the underlying open layers
   * data.
   */
  private refreshRenderValues() {
    const view = this.getView();
    if (!view) {
      return;
    }
    const resolution = view.getResolution();
    if (!resolution || resolution < EPSILON) {
      return;
    }
    // The location of the center right now
    const centerIndex = view.getCenter();
    const extent = view.getProjection().getExtent();
    const rotation = view.getRotation();
    const zoom = view.getZoom();

    const {
      metadata: {
        spacing: [xSpacing, ySpacing],
      },
    } = this;

    // this means that each unit (pixel) in the world (video) would be
    // represented by n pixels in the canvas.
    const worldToCanvasRatio = 1 / resolution / xSpacing;

    Object.assign(this.internalCamera, {
      extent,
      centerIndex,
      worldToCanvasRatio,
      xSpacing,
      ySpacing,
      resolution,
      rotation,
      zoom,
    });
  }

  public customRenderViewportToCanvas = () => {
    // console.log('TODO - custom render');
  };

  public getZoom() {
    return this.getView()?.getZoom();
  }

  public setZoom(zoom: number) {
    this.getView()?.setZoom(zoom);
  }

  /**
   * The transform here is from index to canvas points, so this takes
   * into account the scaling applied and the center location, but nothing to do
   * with world coordinate transforms.
   *  Note that the 'index' values are often negative values with respect to the overall
   * image area, as that is what is used internally for the view.
   *
   * @returns A transform from index to canvas points
   */
  protected getTransform() {
    this.refreshRenderValues();
    const { centerIndex: center, resolution, rotation } = this.internalCamera;

    const halfCanvas = [this.canvas.width / 2, this.canvas.height / 2];
    const transform = new Transform();

    // Translate to the center of the canvas (move origin of the transform
    // to the center of the canvas)
    transform.translate(halfCanvas[0], halfCanvas[1]);
    // Difference in sign for x/y to account for screen coordinates
    transform.rotate(rotation);
    transform.scale(1 / resolution, -1 / resolution);
    transform.translate(-center[0], -center[1]);
    return transform;
  }

  public getReferenceId(): string {
    return `imageId:${this.getCurrentImageId()}`;
  }

  public getCurrentImageIdIndex() {
    return 0;
  }
}

export default WSIViewport;
