import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import applyPreset from './helpers/applyPreset';
// ~~
import {
  CONSTANTS,
  imageCache,
  RenderingEngine,
  getEnabledElement,
  renderingEventTarget,
  EVENTS as RENDERING_EVENTS,
} from './../src/index';
import csTools3d, {
  PanTool,
  WindowLevelTool,
  ToolGroupManager,
  ToolBindings,
} from './../src/cornerstone-tools-3d/index';
// ~~
import './ExampleVTKMPR.css';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

const renderingEngineUID = 'PETCTRenderingEngine';
const ctVolumeUID = 'CT_VOLUME';

const SCENE_IDS = {
  CT: 'ctScene',
  PT: 'ptScene',
  FUSION: 'fusionScene',
  PTMIP: 'ptMipScene',
  CTVR: 'ctVRScene',
};

const VIEWPORT_IDS = {
  CT: {
    AXIAL: 'ctAxial',
    SAGITTAL: 'ctSagittal',
    CORONAL: 'ctCoronal',
  },
  CTVR: {
    VR: 'ctVR',
  },
};

// TODO -> Need to add tools on mount.

// // These need to be in lifecylce so we can undo on page death
// csTools3d.addTool(PanTool, {}); // Should work w/ undefined
// csTools3d.addTool(WindowLevelTool, {}); // Should work w/ undefined

// const mySpecialToolGroup = ToolGroupManager.createToolGroup('a-tool-group-id');

// // Options should be... Optional. Verify.
// mySpecialToolGroup.addTool('WindowLevel', {
//   configuration: { volumeUID: ctVolumeUID },
// });
// mySpecialToolGroup.addTool('Pan', {});
// mySpecialToolGroup.setToolActive('WindowLevel', {
//   bindings: [ToolBindings.Mouse.Primary],
// });
// mySpecialToolGroup.setToolActive('Pan', {
//   bindings: [ToolBindings.Mouse.Auxiliary],
// });

// // Add viewports
// renderingEventTarget.addEventListener(RENDERING_EVENTS.ELEMENT_ENABLED, evt => {
//   // Is DOM element
//   const canvas = evt.detail.canvas;
//   // Is construct
//   const enabledElement = getEnabledElement(canvas);
//   const { viewportUID, sceneUID, renderingEngineUID } = enabledElement;

//   // How... do I identify viewports / hanging-protocol?
//   // Only thing I can think to do here is add by catching enabled_element event
//   // Assume remove should auto-happen when element is destroyed/disabled?
//   mySpecialToolGroup.addViewports(renderingEngineUID, sceneUID, viewportUID);
// });

// TODO:
// X Import our example tool
// X Add tools...
// X Create tool group
// ~ Add viewport to tool group
// X Add tool to tool group
// ~ See if we can get dispatcher to pull correct tool on event
// ~ See if we can change the camera

// renderingEventTarget.addEventListener(EVENTS.IMAGE_RENDERED, evt => {
//   console.log(evt.type);
//   console.log(evt.detail);
// });

// renderingEventTarget.addEventListener(EVENTS.ELEMENT_ENABLED, evt => {
//   console.log(evt.type);
//   console.log(evt.detail);

//   const canvas = evt.detail.canvas;

//   const myEventListner = evt => {
//     console.log(evt);

//     const canvas = evt.detail.canvas;

//     const enabledElement = getEnabledElement(canvas);
//     const { viewport, scene } = enabledElement;

//     // Get camera state
//     const camera = viewport.getCamera();

//     // Example of setting the focalPoint to 0
//     //viewport.setCamera({ focalPoint: [0, 0, 0] });

//     const volumeActors = scene.getVolumeActors();

//     // Example of fetching world coordinates from a canvas click.
//     const worldCoordinates = viewport.canvasToWorld([14, 15]);

//     console.log(volumeActors);
//     console.log(camera);

//     debugger;
//   };

//   canvas.addEventListener(EVENTS.IMAGE_RENDERED, myEventListner);
// });

// renderingEventTarget.addEventListener(EVENTS.ELEMENT_DISABLED, evt => {
//   console.log(evt.type);
//   console.log(evt.detail);
// });

class VTKMPRWithToolEventsExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    destroyed: false,
  };

  constructor(props) {
    super(props);

    this.containers = {
      CT: {
        AXIAL: React.createRef(),
        SAGITTAL: React.createRef(),
        CORONAL: React.createRef(),
      },
      CTVR: {
        VR: React.createRef(),
      },
    };

    this.imageIdsPromise = getImageIdsAndCacheMetadata();
    this.imageIdsPromise.then(() =>
      this.setState({ progressText: 'Loading data...' })
    );
  }

  componentWillUnmount() {
    imageCache.purgeCache();

    this.renderingEngine.destroy();
  }

  async componentDidMount() {
    this.ctVolumeUID = ctVolumeUID;

    const renderingEngine = new RenderingEngine(renderingEngineUID);

    this.renderingEngine = renderingEngine;

    window.renderingEngine = renderingEngine;
    window.imageCache = imageCache;

    const imageIds = await this.imageIdsPromise;

    // Create volumes
    const { ctImageIds } = imageIds;
    const ctVolume = imageCache.makeAndCacheImageVolume(
      ctImageIds,
      ctVolumeUID
    );

    // Initialise all CT values to -1024 so we don't get a grey box?

    const { scalarData } = ctVolume;
    const ctLength = scalarData.length;

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024;
    }

    this.setFourUpCTLayout();
    this.setFourUpCTVolumes();
    this.loadOnlyCtVolume();
    this.setState({ metadataLoaded: true });

    // This will initialise volumes in GPU memory
    renderingEngine.render();
  }

  loadOnlyCtVolume() {
    let ctLoaded = false;

    const ctVolume = imageCache.getImageVolume(ctVolumeUID);

    // As we have reset layout, remove all image load handlers and start again.
    imageCache.cancelLoadAllVolumes();

    const numberOfCtFrames = ctVolume.imageIds.length;

    const reRenderFractionCt = numberOfCtFrames / 50;
    let reRenderTargetCt = reRenderFractionCt;

    imageCache.loadVolume(ctVolumeUID, event => {
      // Only call on modified every 2%.

      if (
        event.framesProcessed > reRenderTargetCt ||
        event.framesProcessed === event.numFrames
      ) {
        reRenderTargetCt += reRenderFractionCt;
        if (!this.renderingEngine.hasBeenDestroyed) {
          this.renderingEngine.render();
        }

        if (event.framesProcessed === event.numFrames) {
          ctLoaded = true;

          if (ctLoaded) {
            this.setState({ progressText: 'Loaded.' });
          }
        }
      }
    });
  }

  setFourUpCTLayout = () => {
    this.renderingEngine.setViewports([
      // CT
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.CT.AXIAL.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.CT.SAGITTAL.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.CT.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CTVR,
        viewportUID: VIEWPORT_IDS.CTVR.VR,
        type: VIEWPORT_TYPE.PERSPECTIVE,
        canvas: this.containers.CTVR.VR.current,
        defaultOptions: {
          orientation: {
            // Some arbitrary rotation so you can tell its 3D
            sliceNormal: [-0.50000000827545, 0.8660253990066052, 0],
            viewUp: [0, 0, 1],
          },
        },
      },
    ]);
  };

  setFourUpCTVolumes() {
    const renderingEngine = this.renderingEngine;
    const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
    const ctVRScene = renderingEngine.getScene(SCENE_IDS.CTVR);

    ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: this.setCTWWWC }]);

    ctVRScene.setVolumes([
      { volumeUID: ctVolumeUID, callback: this.setCTVRTransferFunction },
    ]);
  }

  setCTWWWC = ({ volumeActor, volumeUID }) => {
    const volume = imageCache.getImageVolume(volumeUID);

    const { windowWidth, windowCenter } = volume.metadata.voiLut[0];

    const lower = windowCenter - windowWidth / 2.0;
    const upper = windowCenter + windowWidth / 2.0;

    volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .setRange(lower, upper);
  };

  setCTVRTransferFunction({ volumeActor, volumeUID }) {
    const volume = imageCache.getImageVolume(volumeUID);

    const { windowWidth, windowCenter } = volume.metadata.voiLut[0];

    const lower = windowCenter - windowWidth / 2.0;
    const upper = windowCenter + windowWidth / 2.0;

    volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .setRange(lower, upper);

    const preset = {
      name: 'CT-Bones',
      gradientOpacity: '4 0 1 985.12 1',
      specularPower: '1',
      scalarOpacity: '8 -1000 0 152.19 0 278.93 0.190476 952 0.2',
      id: 'vtkMRMLVolumePropertyNode4',
      specular: '0',
      shade: '1',
      ambient: '0.2',
      colorTransfer:
        '20 -1000 0.3 0.3 1 -488 0.3 1 0.3 463.28 1 0 0 659.15 1 0.912535 0.0374849 953 1 0.3 0.3',
      selectable: 'true',
      diffuse: '1',
      interpolation: '1',
      effectiveRange: '152.19 952',
    };

    applyPreset(volumeActor, preset);

    volumeActor.getProperty().setScalarOpacityUnitDistance(0, 2.5);
  }

  destroyAndDecacheAllVolumes = () => {
    this.renderingEngine.destroy();

    imageCache.purgeCache();
  };

  render() {
    const fourUpStyle = {
      width: '384px',
      height: '384px',
      borderStyle: 'solid',
      borderColor: 'blue',
    };

    const { metadataLoaded, destroyed } = this.state;
    const viewportLayout = (
      <React.Fragment>
        <div>
          <div className="container-row">
            <canvas ref={this.containers.CT.AXIAL} style={fourUpStyle} />
            <canvas ref={this.containers.CT.SAGITTAL} style={fourUpStyle} />
          </div>
          <div className="container-row">
            <canvas ref={this.containers.CT.CORONAL} style={fourUpStyle} />
            <canvas ref={this.containers.CTVR.VR} style={fourUpStyle} />
          </div>
        </div>
      </React.Fragment>
    );

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h5>MPR Template Example: {this.state.progressText} </h5>
          </div>
          <div className="col-xs-12">
            <button onClick={() => metadataLoaded && !destroyed}>Render</button>
          </div>
          <div className="col-xs-12">
            <button
              onClick={() =>
                metadataLoaded &&
                !destroyed &&
                this.destroyAndDecacheAllVolumes()
              }
            >
              Destroy Rendering Engine and Decache All Volumes
            </button>
          </div>
        </div>
        <div className="viewport-container">{viewportLayout}</div>
      </div>
    );
  }
}

export default VTKMPRWithToolEventsExample;
