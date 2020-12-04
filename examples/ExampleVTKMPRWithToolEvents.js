import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import applyPreset from './helpers/applyPreset';
// ~~
import {
  CONSTANTS,
  imageCache,
  RenderingEngine,
  getEnabledElement,
  getRenderingEngine,
  renderingEventTarget,
  Events as RENDERING_EVENTS,
} from './../src/index';
import csTools3d, {
  PanTool,
  SynchronizerManager,
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

/*
const synchronizer = SynchronizerManager.createSynchronizer(
  'syncId',
  RENDERING_EVENTS.CAMERA_UPDATED,
  function(
    synchronizerInstance,
    sourceViewport,
    targetViewport,
    cameraUpdatedEvent
  ) {
    // We need a helper for this
    if (
      sourceViewport.renderingEngineUID === targetViewport.renderingEngineUID &&
      sourceViewport.sceneUID === targetViewport.sceneUID &&
      sourceViewport.viewportUID === targetViewport.viewportUID
    ) {
      return;
    }

    const { camera, previousCamera } = cameraUpdatedEvent.detail;
    const deltaX = camera.position[0] - previousCamera.position[0];
    const deltaY = camera.position[1] - previousCamera.position[1];
    const deltaZ = camera.position[2] - previousCamera.position[2];
    const tViewport = getRenderingEngine(targetViewport.renderingEngineUID)
      .getScene(targetViewport.sceneUID)
      .getViewport(targetViewport.viewportUID);
    const { focalPoint, position } = tViewport.getCamera();

    const updatedPosition = [
      position[0] - deltaX,
      position[1] - deltaY,
      position[2] - deltaZ,
    ];
    const updatedFocalPoint = [
      focalPoint[0] - deltaX,
      focalPoint[1] - deltaY,
      focalPoint[2] - deltaZ,
    ];

    tViewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
    tViewport.render();
  }
);

// Add viewports
renderingEventTarget.addEventListener(RENDERING_EVENTS.ELEMENT_ENABLED, evt => {
  // Is DOM element
  const canvas = evt.detail.canvas;
  // Is construct
  const enabledElement = getEnabledElement(canvas);
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement;

  // How... do I identify viewports / hanging-protocol?
  // Only thing I can think to do here is add by catching enabled_element event
  // Assume remove should auto-happen when element is destroyed/disabled?
  mySpecialToolGroup.addViewports(renderingEngineUID, sceneUID, viewportUID);
  synchronizer.add(renderingEngineUID, sceneUID, viewportUID);
});
*/

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
