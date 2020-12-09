import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import ptCtToggleAnnotationTool from './helpers/ptCtToggleAnnotationTool';
import { cameraFocalPointAndPositionSync } from './helpers/cameraFocalPointAndPositionSync';
import voiSync from './helpers/voiSync';
import loadVolumes from './helpers/loadVolumes';
import {
  imageCache,
  RenderingEngine,
  getRenderingEngine,
  Events as RENDERING_EVENTS,
} from './../src/index';
import { initToolGroups, destroyToolGroups } from './initToolGroups';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import ViewportGrid from './components/ViewportGrid';
import { SynchronizerManager } from './../src/cornerstone-tools-3d/index';
import './ExampleVTKMPR.css';
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  SCENE_IDS,
} from './constants';
import LAYOUTS, { ptCtFusion, fourUpCT, singlePTSagittal } from './layouts';

console.log(RENDERING_EVENTS);

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
    layoutIndex: 1,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 4,
      numRows: 3,
      viewports: [
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          cellStyle: {
            gridRow: '1 / span 3',
            gridColumn: '4',
          },
        },
      ],
    },
    isAnnotationToolOn: false,
  };

  constructor(props) {
    super(props);

    this._canvasNodes = new Map();
    this.testRender = this.testRender.bind(this);
    this.swapPetTransferFunction = this.swapPetTransferFunction.bind(this);
    this.imageIdsPromise = getImageIdsAndCacheMetadata();
    this.imageIdsPromise.then(() =>
      this.setState({ progressText: 'Loading data...' })
    );

    this.axialSync = SynchronizerManager.createSynchronizer(
      'axialSync',
      RENDERING_EVENTS.CAMERA_MODIFIED,
      cameraFocalPointAndPositionSync
    );
    this.sagittalSync = SynchronizerManager.createSynchronizer(
      'sagittalSync',
      RENDERING_EVENTS.CAMERA_MODIFIED,
      cameraFocalPointAndPositionSync
    );
    this.coronalSync = SynchronizerManager.createSynchronizer(
      'coronalSync',
      RENDERING_EVENTS.CAMERA_MODIFIED,
      cameraFocalPointAndPositionSync
    );
    this.ctWLSync = SynchronizerManager.createSynchronizer(
      'ctWLSync',
      RENDERING_EVENTS.VOI_MODIFIED,
      voiSync
    );
    this.ptThresholdSync = SynchronizerManager.createSynchronizer(
      'ptThresholdSync',
      RENDERING_EVENTS.VOI_MODIFIED,
      voiSync
    );
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    //this.checkCanvasNodes();
    this.ctVolumeUID = ctVolumeUID;
    this.ptVolumeUID = ptVolumeUID;

    const renderingEngine = new RenderingEngine(renderingEngineUID);

    this.renderingEngine = renderingEngine;

    window.renderingEngine = renderingEngine;

    ptCtFusion.setLayout(
      renderingEngine,
      this._canvasNodes,
      {
        ctSceneToolGroup,
        ptSceneToolGroup,
        fusionSceneToolGroup,
        ptMipSceneToolGroup,
      },
      {
        axialSynchronizers: [this.axialSync],
        sagittalSynchronizers: [this.sagittalSync],
        coronalSynchronizers: [this.coronalSync],
        ptThresholdSynchronizer: this.ptThresholdSync,
        ctWLSynchronizer: this.ctWLSync,
      }
    );

    // Create volumes
    const imageIds = await this.imageIdsPromise;
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

    loadVolumes(onLoad, [ptVolumeUID, ctVolumeUID], [], this.renderingEngine);

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
    const { renderingEngine } = this;
    const onLoad = () => this.setState({ progressText: 'Loaded.' });

    //this.checkCanvasNodes();

    if (prevState.layoutIndex !== layoutIndex) {
      if (layoutIndex === 0) {
        // FusionMIP

        ptCtFusion.setLayout(
          renderingEngine,
          this._canvasNodes,
          {
            ctSceneToolGroup,
            ptSceneToolGroup,
            fusionSceneToolGroup,
            ptMipSceneToolGroup,
          },
          {
            axialSynchronizers: [this.axialSync],
            sagittalSynchronizers: [this.sagittalSync],
            coronalSynchronizers: [this.coronalSync],
            ptThresholdSynchronizer: this.ptThresholdSync,
            ctWLSynchronizer: this.ctWLSync,
          }
        );

        ptCtFusion.setVolumes(
          renderingEngine,
          ctVolumeUID,
          ptVolumeUID,
          colormaps[this.state.petColorMapIndex]
        );

        loadVolumes(
          onLoad,
          [ptVolumeUID, ctVolumeUID],
          [],
          this.renderingEngine
        );
        renderingEngine.render();
        renderingEngine.resize();
      } else if (layoutIndex === 1) {
        // CTVR
        fourUpCT.setLayout(renderingEngine, this._canvasNodes, {
          ctSceneToolGroup,
          ctVRSceneToolGroup,
        });
        fourUpCT.setVolumes(renderingEngine, ctVolumeUID);
        loadVolumes(onLoad, [ctVolumeUID], [ptVolumeUID], this.renderingEngine);
        renderingEngine.resize();
        renderingEngine.render();
      } else if (layoutIndex === 2) {
        // SinglePTSagittal
        singlePTSagittal.setLayout(renderingEngine, this._canvasNodes);
        singlePTSagittal.setVolumes(renderingEngine, ptVolumeUID);
        loadVolumes(onLoad, [ptVolumeUID], [ctVolumeUID], this.renderingEngine);
        renderingEngine.render();
        renderingEngine.resize();
      } else {
        throw new Error('Unrecognised layout index');
      }
    }
  }

  componentWillUnmount() {
    imageCache.purgeCache();

    this.renderingEngine.destroy();
  }

  // checkCanvasNodes() {
  //   Array.from(this._canvasNodes.values())
  //     .filter(node => node !== null)
  //     .forEach(node => {
  //       // do something
  //     });
  // }

  swapLayout = layoutId => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return;
    }

    const viewportGrid = JSON.parse(JSON.stringify(this.state.viewportGrid));
    const layoutIndex = LAYOUTS.findIndex(id => id === layoutId);

    viewportGrid.viewports = [];

    // 0 - petCt
    if (layoutIndex === 0) {
      viewportGrid.numCols = 4;
      viewportGrid.numRows = 3;
      [0, 1, 2, 3, 4, 5, 6, 7, 8].forEach(x => viewportGrid.viewports.push({}));
      viewportGrid.viewports.push({
        cellStyle: {
          gridRow: '1 / span 3',
          gridColumn: '4',
        },
      });
    }
    // 1 - fourUp
    else if (layoutIndex === 1) {
      viewportGrid.numCols = 2;
      viewportGrid.numRows = 2;
      [0, 1, 2, 3].forEach(x => viewportGrid.viewports.push({}));
    }
    // 2 - singlePTSpacial
    else {
      viewportGrid.numRows = 1;
      viewportGrid.numCols = 1;
      viewportGrid.viewports.push({});
    }

    this.setState({
      layoutIndex,
      viewportGrid,
    });
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

    const range = volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .getMappingRange();

    const cfun = vtkColorTransferFunction.newInstance();
    const preset = vtkColorMaps.getPresetByName(colormaps[petColorMapIndex]);
    cfun.applyColorMap(preset);
    cfun.setMappingRange(range[0], range[1]);

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
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return;
    }
    this.renderingEngine.destroy();

    imageCache.purgeCache();
  };

  render() {
    const { layoutIndex, metadataLoaded, destroyed } = this.state;
    let { isAnnotationToolOn } = this.state;
    const layout = LAYOUTS[layoutIndex];
    const layoutButtons = [
      { id: 'SinglePTSagittal', text: 'Single PT Sagittal Layout' },
      { id: 'FusionMIP', text: 'Fusion Layout' },
      { id: 'CTVR', text: 'Four Up CT Layout' },
    ];
    const filteredLayoutButtons = layoutButtons.filter(x => x !== layout.id);
    const switchToolText = isAnnotationToolOn
      ? 'Switch To WWWC'
      : 'Switch To Probe';

    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>MPR Template Example ({this.state.progressText})</h2>
          </div>
          <div className="col-xs-12">
            <button
              onClick={() => metadataLoaded && !destroyed && this.testRender()}
              className="btn btn-secondary"
            >
              Render Test
            </button>
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
            {/* LAYOUT BUTTONS */}
            {filteredLayoutButtons.map(layout => (
              <button
                key={layout.id}
                onClick={() => this.swapLayout(layout.id)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                {layout.text}
              </button>
            ))}
            {/* TOGGLES */}
            <button
              onClick={() =>
                metadataLoaded && !destroyed && this.swapPetTransferFunction()
              }
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              SwapPetTransferFunction
            </button>
            <button
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
              onClick={() => {
                isAnnotationToolOn = !isAnnotationToolOn;

                ptCtToggleAnnotationTool(
                  isAnnotationToolOn,
                  ctSceneToolGroup,
                  ptSceneToolGroup,
                  fusionSceneToolGroup
                );
                this.setState({ isAnnotationToolOn });
              }}
            >
              {switchToolText}
            </button>
            {/* DANGER */}
            <button
              onClick={() => this.destroyAndDecacheAllVolumes()}
              className="btn btn-danger"
              style={{ margin: '2px 4px' }}
            >
              Destroy Rendering Engine and Decache All Volumes
            </button>
          </div>
        </div>
        <ViewportGrid
          numCols={this.state.viewportGrid.numCols}
          numRows={this.state.viewportGrid.numRows}
          style={{ minHeight: '650px', marginTop: '35px' }}
        >
          {this.state.viewportGrid.viewports.map((vp, i) => (
            <div
              className="viewport-pane"
              style={{
                ...(vp.cellStyle || {}),
                border: '2px solid grey',
                background: 'black',
              }}
              key={i}
            >
              <canvas ref={c => this._canvasNodes.set(i, c)} />
            </div>
          ))}
        </ViewportGrid>
      </div>
    );
  }
}

export default VTKMPRExample;
