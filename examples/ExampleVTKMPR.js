import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import applyPreset from './helpers/applyPreset';
import {
  CONSTANTS,
  imageCache,
  RenderingEngine,
  utils,
  renderingEventTarget,
  getEnabledElement,
  EVENTS,
} from './../src/index';
import csTools3d, {
  PanTool,
  WindowLevelTool,
  PetThresholdTool,
  StackScrollTool,
  ToolGroupManager,
  ToolBindings,
} from './../src/cornerstone-tools-3d/index';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import Constants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants';
const { BlendMode } = Constants;

import './ExampleVTKMPR.css';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

const renderingEngineUID = 'PETCTRenderingEngine';
const ptVolumeUID = 'PET_VOLUME';
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
  PT: {
    AXIAL: 'ptAxial',
    SAGITTAL: 'ptSagittal',
    CORONAL: 'ptCoronal',
  },
  FUSION: {
    AXIAL: 'fusionAxial',
    SAGITTAL: 'fusionSagittal',
    CORONAL: 'fusionCoronal',
  },
  PTMIP: {
    CORONAL: 'ptMipCoronal',
  },
  CTVR: {
    VR: 'ctVR',
  },
};

const TOOL_GROUP_UIDS = {
  CT: 'ctSceneToolGroup',
  PT: 'ptSceneToolGroup',
  FUSION: 'fusionSceneToolGroup',
  PTMIP: 'ptMipSceneToolGroup',
};

// TODO: Can we delete tool groups?
// These need to be in lifecylce so we can undo on page death
csTools3d.addTool(PanTool, {});
csTools3d.addTool(WindowLevelTool, {});
csTools3d.addTool(PetThresholdTool, {});
csTools3d.addTool(StackScrollTool, {});

const ctSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.CT);
const ptSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.PT);
const fusionSceneToolGroup = ToolGroupManager.createToolGroup(
  TOOL_GROUP_UIDS.FUSION
);
const ptMipSceneToolGroup = ToolGroupManager.createToolGroup(
  TOOL_GROUP_UIDS.PTMIP
);

// Set up CT Scene tools
ctSceneToolGroup.addTool('WindowLevel', {
  configuration: { volumeUID: ctVolumeUID },
});
ctSceneToolGroup.addTool('Pan', {});
ctSceneToolGroup.setToolActive('WindowLevel', {
  bindings: [ToolBindings.Mouse.Primary],
});
ctSceneToolGroup.setToolActive('Pan', {
  bindings: [ToolBindings.Mouse.Auxiliary],
});

// Set up PT Scene tools
ptSceneToolGroup.addTool('PetThreshold', {
  configuration: { volumeUID: ptVolumeUID },
});
ptSceneToolGroup.addTool('Pan', {});
ptSceneToolGroup.setToolActive('PetThreshold', {
  bindings: [ToolBindings.Mouse.Primary],
});
ptSceneToolGroup.setToolActive('Pan', {
  bindings: [ToolBindings.Mouse.Auxiliary],
});

// Set up Fusion Scene tools
fusionSceneToolGroup.addTool('Pan', {});
fusionSceneToolGroup.addTool('StackScroll', {});

// TODO -> Move to mouse wheel.
fusionSceneToolGroup.setToolActive('StackScroll', {
  bindings: [ToolBindings.Mouse.Primary],
});

fusionSceneToolGroup.setToolActive('Pan', {
  bindings: [ToolBindings.Mouse.Auxiliary],
});

const colormaps = ['hsv', 'RED-PURPLE'];
const layouts = ['FusionMIP', 'CTVR', 'SinglePTSagittal'];

class VTKMPRExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
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
      PT: {
        AXIAL: React.createRef(),
        SAGITTAL: React.createRef(),
        CORONAL: React.createRef(),
      },
      FUSION: {
        AXIAL: React.createRef(),
        SAGITTAL: React.createRef(),
        CORONAL: React.createRef(),
      },
      PTMIP: {
        CORONAL: React.createRef(),
      },
      CTVR: {
        VR: React.createRef(),
      },
    };

    this.testRender = this.testRender.bind(this);
    this.swapPetTransferFunction = this.swapPetTransferFunction.bind(this);

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
    this.ptVolumeUID = ptVolumeUID;

    const renderingEngine = new RenderingEngine(renderingEngineUID);

    this.renderingEngine = renderingEngine;

    window.renderingEngine = renderingEngine;
    window.imageCache = imageCache;

    this.setPTCTFusionLayout();

    const imageIds = await this.imageIdsPromise;

    // Create volumes

    const { ptImageIds, ctImageIds } = imageIds;

    const ptVolume = imageCache.makeAndCacheImageVolume(
      ptImageIds,
      ptVolumeUID
    );
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

    this.loadAllVolumes();
    this.setPTCTFusionVolumes();

    this.setState({ metadataLoaded: true });

    // This will initialise volumes in GPU memory
    renderingEngine.render();
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state;
    const { renderingEngine } = this;

    if (prevState.layoutIndex !== layoutIndex) {
      if (layoutIndex === 0) {
        // FusionMIP

        this.setPTCTFusionLayout();
        this.setPTCTFusionVolumes();
        this.loadAllVolumes(); // Will do nothing if already loading.
        renderingEngine.render();
      } else if (layoutIndex === 1) {
        // CTVR

        this.setFourUpCTLayout();
        this.setFourUpCTVolumes();
        this.loadOnlyCtVolume();
        renderingEngine.render();
      } else if (layoutIndex === 2) {
        // SinglePTSagittal

        this.setSinglePTSagittalLayout();
        this.setSinglePTSagittalVolumes();
        this.loadOnlyPtVolume(); // Will do nothing if already loading.
        renderingEngine.render();
      } else {
        throw new Error('Unrecognised layout index');
      }
    }
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
        if (!renderingEngine.hasBeenDestroyed) {
          renderingEngine.render();
        }

        if (event.framesProcessed === event.numFrames) {
          ctLoaded = true;

          if (ctLoaded) {
            this.setState({ progressText: 'Loaded.' });
          }
        }
      }
    });

    // Add PT to load in background after CT is done.
    imageCache.loadVolume(ptVolumeUID);
  }

  loadOnlyPtVolume() {
    let ptLoaded = false;

    const ptVolume = imageCache.getImageVolume(ptVolumeUID);

    const numberOfPetFrames = ptVolume.imageIds.length;

    // As we have reset layout, remove all image load handlers and start again.
    imageCache.cancelLoadAllVolumes();

    const reRenderFractionPt = numberOfPetFrames / 50;
    let reRenderTargetPt = reRenderFractionPt;

    imageCache.loadVolume(ptVolumeUID, event => {
      if (
        event.framesProcessed > reRenderTargetPt ||
        event.framesProcessed == numberOfPetFrames
      ) {
        reRenderTargetPt += reRenderFractionPt;

        if (!renderingEngine.hasBeenDestroyed) {
          renderingEngine.render();
        }

        if (event.framesProcessed === event.numFrames) {
          ptLoaded = true;

          if (ptLoaded) {
            this.setState({ progressText: 'Loaded.' });
          }
        }
      }
    });

    // Add CT to load in background after PT is done.
    imageCache.loadVolume(ctVolumeUID);
  }

  loadAllVolumes() {
    let ptLoaded = false;
    let ctLoaded = false;

    const ptVolume = imageCache.getImageVolume(ptVolumeUID);
    const ctVolume = imageCache.getImageVolume(ctVolumeUID);

    // As we have reset layout, remove all image load handlers and start again.
    imageCache.cancelLoadAllVolumes();

    const numberOfPetFrames = ptVolume.imageIds.length;

    const reRenderFractionPt = numberOfPetFrames / 50;
    let reRenderTargetPt = reRenderFractionPt;

    imageCache.loadVolume(ptVolumeUID, event => {
      if (
        event.framesProcessed > reRenderTargetPt ||
        event.framesProcessed == numberOfPetFrames
      ) {
        reRenderTargetPt += reRenderFractionPt;

        if (!renderingEngine.hasBeenDestroyed) {
          renderingEngine.render();
        }

        if (event.framesProcessed === event.numFrames) {
          ptLoaded = true;

          if (ctLoaded && ptLoaded) {
            this.setState({ progressText: 'Loaded.' });
          }
        }
      }
    });

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
        if (!renderingEngine.hasBeenDestroyed) {
          renderingEngine.render();
        }

        if (event.framesProcessed === event.numFrames) {
          ctLoaded = true;

          if (ctLoaded && ptLoaded) {
            this.setState({ progressText: 'Loaded.' });
          }
        }
      }
    });
  }

  swapLayout = layoutId => {
    const layoutIndex = layouts.findIndex(id => id === layoutId);

    this.setState({ layoutIndex });
  };

  setSinglePTSagittalLayout = () => {
    this.renderingEngine.setViewports([
      // PT Sagittal
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PT.SAGITTAL.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 1, 1],
        },
      },
    ]);
  };

  setSinglePTSagittalVolumes() {
    const renderingEngine = this.renderingEngine;
    const ptScene = renderingEngine.getScene(SCENE_IDS.PT);
    ptScene.setVolumes([
      { volumeUID: ptVolumeUID, callback: this.setPetTransferFunction },
    ]);
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

  setPTCTFusionLayout = () => {
    const viewportInput = [
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

      // PT

      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PT.AXIAL.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 1, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PT.SAGITTAL.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 1, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PT.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [1, 1, 1],
        },
      },

      // Fusion

      {
        sceneUID: SCENE_IDS.FUSION,
        viewportUID: VIEWPORT_IDS.FUSION.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.FUSION.AXIAL.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.FUSION,
        viewportUID: VIEWPORT_IDS.FUSION.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.FUSION.SAGITTAL.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: SCENE_IDS.FUSION,
        viewportUID: VIEWPORT_IDS.FUSION.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.FUSION.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },

      // PET MIP
      {
        sceneUID: SCENE_IDS.PTMIP,
        viewportUID: VIEWPORT_IDS.PTMIP.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PTMIP.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [1, 1, 1],
        },
      },
    ];

    this.renderingEngine.setViewports(viewportInput);

    // Add tools

    const renderingEngineUID = this.renderingEngine.uid;

    viewportInput.forEach(viewportInputEntry => {
      const { sceneUID, viewportUID } = viewportInputEntry;

      if (sceneUID === SCENE_IDS.CT) {
        console.log(`adding ${viewportUID} to CT toolgroup`);
        ctSceneToolGroup.addViewports(
          renderingEngineUID,
          sceneUID,
          viewportUID
        );
      } else if (sceneUID === SCENE_IDS.PT) {
        console.log(`adding ${viewportUID} to PT toolgroup`);
        ptSceneToolGroup.addViewports(
          renderingEngineUID,
          sceneUID,
          viewportUID
        );
      } else if (sceneUID === SCENE_IDS.FUSION) {
        console.log(`adding ${viewportUID} to FUSION toolgroup`);
        fusionSceneToolGroup.addViewports(
          renderingEngineUID,
          sceneUID,
          viewportUID
        );
      } else if (sceneUID === SCENE_IDS.PTMIP) {
        console.log(`adding ${viewportUID} to PTMIP toolgroup`);
        ptMipSceneToolGroup.addViewports(
          renderingEngineUID,
          sceneUID,
          viewportUID
        );
      }
    });

    renderingEngine.render(); // Render backgrounds
  };

  setPTCTFusionVolumes() {
    const renderingEngine = this.renderingEngine;
    const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
    const ptScene = renderingEngine.getScene(SCENE_IDS.PT);
    const fusionScene = renderingEngine.getScene(SCENE_IDS.FUSION);
    const ptMipScene = renderingEngine.getScene(SCENE_IDS.PTMIP);

    ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: this.setCTWWWC }]);
    ptScene.setVolumes([
      { volumeUID: ptVolumeUID, callback: this.setPetTransferFunction },
    ]);

    fusionScene.setVolumes([
      { volumeUID: ctVolumeUID, callback: this.setCTWWWC },
      { volumeUID: ptVolumeUID, callback: this.setPetColorMapTransferFunction },
    ]);

    const ptVolume = imageCache.getImageVolume(ptVolumeUID);
    const ptVolumeDimensions = ptVolume.dimensions;

    // Only make the MIP as large as it needs to be. This coronal MIP will be
    // rotated so need the diagonal across the Axial Plane.

    const slabThickness = Math.sqrt(
      ptVolumeDimensions[0] * ptVolumeDimensions[0] +
        ptVolumeDimensions[1] * ptVolumeDimensions[1]
    );

    ptMipScene.setVolumes([
      {
        volumeUID: ptVolumeUID,
        callback: this.setPetTransferFunction,
        blendMode: BlendMode.MAXIMUM_INTENSITY_BLEND,
        slabThickness,
      },
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

  setPetTransferFunction = ({ volumeActor, volumeUID }) => {
    const rgbTransferFunction = volumeActor
      .getProperty()
      .getRGBTransferFunction(0);

    rgbTransferFunction.setRange(0, 5);

    utils.invertRgbTransferFunction(rgbTransferFunction);
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

  setPetColorMapTransferFunction = ({ volumeActor }) => {
    const mapper = volumeActor.getMapper();
    mapper.setSampleDistance(1.0);

    const cfun = vtkColorTransferFunction.newInstance();
    const preset = vtkColorMaps.getPresetByName(
      colormaps[this.state.petColorMapIndex]
    );
    cfun.applyColorMap(preset);
    cfun.setMappingRange(0, 5);

    volumeActor.getProperty().setRGBTransferFunction(0, cfun);

    // Create scalar opacity function
    const ofun = vtkPiecewiseFunction.newInstance();
    ofun.addPoint(0, 0.0);
    ofun.addPoint(0.1, 0.9);
    ofun.addPoint(5, 1.0);

    volumeActor.getProperty().setScalarOpacity(0, ofun);
  };

  testRender() {
    if (this.performingRenderTest) {
      return;
    }

    this.performingRenderTest = true;
    const renderingEngine = this.renderingEngine;

    const count = 100;

    let t0 = performance.now();
    for (let i = 0; i < count; i++) {
      renderingEngine.render();
    }

    let t1 = performance.now();

    this.performingRenderTest = false;

    alert(`${(t1 - t0) / count} ms`);
  }

  swapPetTransferFunction() {
    const renderingEngine = this.renderingEngine;
    const petCTScene = renderingEngine.getScene(SCENE_IDS.FUSION);

    if (!petCTScene) {
      // We have likely changed view and the scene no longer exists.
      return;
    }

    const volumeActor = petCTScene.getVolumeActor(ptVolumeUID);

    let petColorMapIndex = this.state.petColorMapIndex;

    petColorMapIndex = petColorMapIndex === 0 ? 1 : 0;

    const mapper = volumeActor.getMapper();
    mapper.setSampleDistance(1.0);

    const cfun = vtkColorTransferFunction.newInstance();
    const preset = vtkColorMaps.getPresetByName(colormaps[petColorMapIndex]);
    cfun.applyColorMap(preset);
    cfun.setMappingRange(0, 5);

    volumeActor.getProperty().setRGBTransferFunction(0, cfun);

    // Create scalar opacity function
    const ofun = vtkPiecewiseFunction.newInstance();
    ofun.addPoint(0, 0.0);
    ofun.addPoint(0.1, 0.9);
    ofun.addPoint(5, 1.0);

    volumeActor.getProperty().setScalarOpacity(0, ofun);

    petCTScene.render();

    this.setState({ petColorMapIndex });
  }

  destroyAndDecacheAllVolumes = () => {
    this.renderingEngine.destroy();

    imageCache.purgeCache();
  };

  render() {
    const activeStyle = {
      width: '256px',
      height: '256px',
      borderStyle: 'solid',
      borderColor: 'aqua',
    };

    const inactiveStyle = {
      width: '256px',
      height: '256px',
      borderStyle: 'solid',
      borderColor: 'blue',
    };

    const ptMIPStyle = {
      width: '384px',
      height: '768px',
      borderStyle: 'solid',
      borderColor: 'blue',
    };

    const largeViewportStyle = {
      width: '1152px',
      height: '768px',
      borderStyle: 'solid',
      borderColor: 'blue',
    };

    const fourUpStyle = {
      width: '384px',
      height: '384px',
      borderStyle: 'solid',
      borderColor: 'blue',
    };

    const { layoutIndex, metadataLoaded, destroyed } = this.state;
    const layout = layouts[layoutIndex];

    let viewportLayout;

    if (layout === 'FusionMIP') {
      viewportLayout = (
        <React.Fragment>
          <div>
            <div className="container-row">
              <canvas ref={this.containers.CT.AXIAL} style={activeStyle} />
              <canvas ref={this.containers.CT.SAGITTAL} style={inactiveStyle} />
              <canvas ref={this.containers.CT.CORONAL} style={inactiveStyle} />
            </div>
            <div className="container-row">
              <canvas ref={this.containers.PT.AXIAL} style={inactiveStyle} />
              <canvas ref={this.containers.PT.SAGITTAL} style={inactiveStyle} />
              <canvas ref={this.containers.PT.CORONAL} style={inactiveStyle} />
            </div>
            <div className="container-row">
              <canvas
                ref={this.containers.FUSION.AXIAL}
                style={inactiveStyle}
              />
              <canvas
                ref={this.containers.FUSION.SAGITTAL}
                style={inactiveStyle}
              />
              <canvas
                ref={this.containers.FUSION.CORONAL}
                style={inactiveStyle}
              />
            </div>
          </div>
          <div>
            <canvas ref={this.containers.PTMIP.CORONAL} style={ptMIPStyle} />
          </div>
        </React.Fragment>
      );
    } else if (layout === 'CTVR') {
      viewportLayout = (
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
    } else if (layout === 'SinglePTSagittal') {
      viewportLayout = (
        <React.Fragment>
          <div>
            <div className="container-row">
              <canvas
                ref={this.containers.PT.SAGITTAL}
                style={largeViewportStyle}
              />
            </div>
          </div>
        </React.Fragment>
      );
    }

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h5>MPR Template Example: {this.state.progressText} </h5>
          </div>
          <div className="col-xs-12">
            <button
              onClick={() => metadataLoaded && !destroyed && this.testRender()}
            >
              Render
            </button>
          </div>
          <div className="col-xs-12">
            <button
              onClick={() =>
                metadataLoaded && !destroyed && this.swapPetTransferFunction()
              }
            >
              SwapPetTransferFunction
            </button>
            {layout !== 'SinglePTSagittal' ? (
              <button
                onClick={() =>
                  metadataLoaded &&
                  !destroyed &&
                  this.swapLayout('SinglePTSagittal')
                }
              >
                Set Layout To Single PT Sagittal Layout
              </button>
            ) : null}
            {layout !== 'FusionMIP' ? (
              <button
                onClick={() =>
                  metadataLoaded && !destroyed && this.swapLayout('FusionMIP')
                }
              >
                Set Layout To Fusion Layout
              </button>
            ) : null}
            {layout !== 'CTVR' ? (
              <button
                onClick={() =>
                  metadataLoaded && !destroyed && this.swapLayout('CTVR')
                }
              >
                Set Layout To Four Up CT
              </button>
            ) : null}

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

export default VTKMPRExample;
