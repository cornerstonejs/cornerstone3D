import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';

import loadVolumes from './helpers/loadVolumes';
import { imageCache, RenderingEngine } from './../src/index';
import { initToolGroups, destroyToolGroups } from './initToolGroups';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import './ExampleVTKMPR.css';
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  SCENE_IDS,
} from './constants';
import LAYOUTS, { ptCtFusion, fourUpCT, singlePTSagittal } from './layouts';

const {
  ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  ptMipSceneToolGroup,
  ctVRSceneToolGroup,
} = initToolGroups();

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

    ptCtFusion.setLayout(renderingEngine, this.containers, {
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

    ptCtFusion.setVolumes(
      renderingEngine,
      ctVolumeUID,
      ptVolumeUID,
      colormaps[this.state.petColorMapIndex]
    );

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

        ptCtFusion.setLayout(renderingEngine, containers, {
          ctSceneToolGroup,
          ptSceneToolGroup,
          fusionSceneToolGroup,
          ptMipSceneToolGroup,
        });

        ptCtFusion.setVolumes(
          renderingEngine,
          ctVolumeUID,
          ptVolumeUID,
          colormaps[this.state.petColorMapIndex]
        );

        loadVolumes(onLoad, [ptVolumeUID, ctVolumeUID]);
        renderingEngine.render();
      } else if (layoutIndex === 1) {
        // CTVR

        fourUpCT.setLayout(renderingEngine, containers, {
          ctSceneToolGroup,
          ctVRSceneToolGroup,
        });
        fourUpCT.setVolumes(renderingEngine, ctVolumeUID);
        loadVolumes(onLoad, [ctVolumeUID], [ptVolumeUID]);
        renderingEngine.render();
      } else if (layoutIndex === 2) {
        // SinglePTSagittal

        singlePTSagittal.setLayout(renderingEngine, containers);
        singlePTSagittal.setVolumes(renderingEngine, ptVolumeUID);
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
