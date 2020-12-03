import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';

import loadVolumes from './helpers/loadVolumes';
import {
  CONSTANTS as RENDERING_ENGINE_CONSTANTS,
  imageCache,
  RenderingEngine,
} from './../src/index';
import { initToolGroups, destroyToolGroups } from './initToolGroups';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants';
import './ExampleVTKMPR.css';
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  SCENE_IDS,
  VIEWPORT_IDS,
} from './constants';
import LAYOUTS, { ptCtFusion } from './layouts';
import {
  setCTWWWC,
  setPetTransferFunction,
  setCTVRTransferFunction,
  getSetPetColorMapTransferFunction,
} from './helpers/transferFunctionHelpers';
const { BlendMode } = vtkConstants;

const {
  ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  ptMipSceneToolGroup,
  ctVRSceneToolGroup,
} = initToolGroups();

const { ORIENTATION, VIEWPORT_TYPE } = RENDERING_ENGINE_CONSTANTS;

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

    ptCtFusion.set(renderingEngine, this.containers, {
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
    });

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

    const onLoad = () => this.setState({ progressText: 'Loaded.' });

    loadVolumes(onLoad, [ptVolumeUID, ctVolumeUID]);

    this.setPTCTFusionVolumes();

    this.setState({ metadataLoaded: true });

    // This will initialise volumes in GPU memory
    renderingEngine.render();
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state;
    const { renderingEngine, containers } = this;

    const onLoad = () => this.setState({ progressText: 'Loaded.' });

    if (prevState.layoutIndex !== layoutIndex) {
      if (layoutIndex === 0) {
        // FusionMIP

        ptCtFusion.set(renderingEngine, containers, {
          ctSceneToolGroup,
          ptSceneToolGroup,
          fusionSceneToolGroup,
          ptMipSceneToolGroup,
        });
        this.setPTCTFusionVolumes();
        loadVolumes(onLoad, [ptVolumeUID, ctVolumeUID]);
        renderingEngine.render();
      } else if (layoutIndex === 1) {
        // CTVR

        this.setFourUpCTLayout();
        this.setFourUpCTVolumes();
        loadVolumes(onLoad, [ctVolumeUID], [ptVolumeUID]);
        renderingEngine.render();
      } else if (layoutIndex === 2) {
        // SinglePTSagittal

        this.setSinglePTSagittalLayout();
        this.setSinglePTSagittalVolumes();
        loadVolumes(onLoad, [ptVolumeUID], [ctVolumeUID]);
        renderingEngine.render();
      } else {
        throw new Error('Unrecognised layout index');
      }
    }
  }

  swapLayout = layoutId => {
    const layoutIndex = LAYOUTS.findIndex(id => id === layoutId);

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
      { volumeUID: ptVolumeUID, callback: setPetTransferFunction },
    ]);
  }

  setFourUpCTLayout = () => {
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
    ];

    this.renderingEngine.setViewports(viewportInput);

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
      } else if (sceneUID === SCENE_IDS.CTVR) {
        console.log(`adding ${viewportUID} to CTVR toolgroup`);
        ctVRSceneToolGroup.addViewports(
          renderingEngineUID,
          sceneUID,
          viewportUID
        );
      }
    });
  };

  setFourUpCTVolumes() {
    const renderingEngine = this.renderingEngine;
    const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
    const ctVRScene = renderingEngine.getScene(SCENE_IDS.CTVR);

    ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);

    ctVRScene.setVolumes([
      { volumeUID: ctVolumeUID, callback: setCTVRTransferFunction },
    ]);
  }

  setPTCTFusionVolumes() {
    const renderingEngine = this.renderingEngine;
    const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
    const ptScene = renderingEngine.getScene(SCENE_IDS.PT);
    const fusionScene = renderingEngine.getScene(SCENE_IDS.FUSION);
    const ptMipScene = renderingEngine.getScene(SCENE_IDS.PTMIP);

    ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);
    ptScene.setVolumes([
      { volumeUID: ptVolumeUID, callback: setPetTransferFunction },
    ]);

    fusionScene.setVolumes([
      { volumeUID: ctVolumeUID, callback: setCTWWWC },
      {
        volumeUID: ptVolumeUID,
        callback: getSetPetColorMapTransferFunction(
          colormaps[this.state.petColorMapIndex]
        ),
      },
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
        callback: setPetTransferFunction,
        blendMode: BlendMode.MAXIMUM_INTENSITY_BLEND,
        slabThickness,
      },
    ]);
  }

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
    const layout = LAYOUTS[layoutIndex];

    let viewportLayout;

    if (layout === 'FusionMIP') {
      viewportLayout = (
        <React.Fragment>
          <div onContextMenu={e => e.preventDefault()}>
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
          <div onContextMenu={e => e.preventDefault()}>
            <canvas ref={this.containers.PTMIP.CORONAL} style={ptMIPStyle} />
          </div>
        </React.Fragment>
      );
    } else if (layout === 'CTVR') {
      viewportLayout = (
        <React.Fragment>
          <div onContextMenu={e => e.preventDefault()}>
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
          <div onContextMenu={e => e.preventDefault()}>
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
