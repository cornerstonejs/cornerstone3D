import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { Events, VOILUTFunctionType } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as utilities from '../src/utilities';
import setDefaultVolumeVOI from '../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import PlanarMountedData from '../src/RenderingEngine/GenericViewport/Planar/PlanarMountedData';
import PlanarLegacyCompatibilityController from '../src/RenderingEngine/GenericViewport/Planar/PlanarLegacyCompatibilityController';
import { getVolumeActorDefaultVOIRange } from '../src/RenderingEngine/GenericViewport/Planar/planarVolumePresentation';

const { toWindowLevel } = utilities.windowLevel;
const dataId = 'ct-display-set';
// LINEAR_EXACT W 400 / C 40 gives the range -160..240 (C.11.2.1.3.2).
const exactRange = { lower: -160, upper: 240 };

// A PlanarViewport with one mounted stack image, without a rendering engine.
function createViewport(image, presentation) {
  const rendering = {
    renderMode: ActorRenderMode.VTK_IMAGE,
    currentImage: image,
    defaultVOIRange: exactRange,
  };
  const viewport = Object.create(PlanarViewport.prototype);

  Object.assign(viewport, {
    id: 'vp-1',
    element: document.createElement('div'),
    suppressEvents: false,
    mountedData: new PlanarMountedData({
      getBinding: () => ({ data: { id: dataId }, rendering }),
      getFirstBinding: () => undefined,
      getBindings: () => [],
      removeData: () => undefined,
    }),
    getDisplaySetPresentation: () => presentation,
    getDataSet: () => undefined,
    getSourceDataId: () => dataId,
    getVolumeId: () => undefined,
  });

  return viewport;
}

describe('generic planar viewport VOI LUT Function (API)', () => {
  it('a SIGMOID volume keeps a default range that converts back to W 400 / C 40', async () => {
    const actor = vtkImageSlice.newInstance();
    const imageVolume = {
      imageIds: [],
      metadata: {
        voiLut: [
          { windowWidth: 400, windowCenter: 40, voiLUTFunction: 'SIGMOID' },
        ],
      },
    };

    await setDefaultVolumeVOI(actor, imageVolume);
    const range = await getVolumeActorDefaultVOIRange(actor, imageVolume);

    expect(
      toWindowLevel(
        range.lower,
        range.upper,
        VOILUTFunctionType.SAMPLED_SIGMOID
      )
    ).toEqual({ windowWidth: 400, windowCenter: 40 });
  });

  it('getProperties gives the VOI LUT Function of the file, so the range converts back to W 400 / C 40', () => {
    const viewport = createViewport(
      { voiLUTFunction: VOILUTFunctionType.LINEAR_EXACT },
      undefined
    );
    const controller = new PlanarLegacyCompatibilityController({
      getElement: () => viewport.element,
      getActiveDataId: () => dataId,
      getDisplaySetPresentation: () => undefined,
      getCameraOrientation: () => undefined,
      getDefaultVOIRange: () => exactRange,
      getVOILUTState: (id) => viewport.getVOILUTState(id),
      getDefaultVOILUTFunction: () => VOILUTFunctionType.LINEAR_EXACT,
    });

    const { voiRange, VOILUTFunction, voiLUTFunctionSetByUser } =
      controller.getProperties();

    expect(VOILUTFunction).toBe(VOILUTFunctionType.LINEAR_EXACT);
    expect(voiLUTFunctionSetByUser).toBe(false);
    expect(
      toWindowLevel(voiRange.lower, voiRange.upper, VOILUTFunction)
    ).toEqual({ windowWidth: 400, windowCenter: 40 });
  });

  it('VOI_MODIFIED gives the function in effect and voiLUTSequenceApplied', () => {
    const voiLUT = {
      firstValueMapped: -160,
      numBitsPerEntry: 8,
      lut: [0, 128, 255],
    };
    const details = [];

    for (const presentation of [undefined, { colormap: { name: 'hsv' } }]) {
      const viewport = createViewport(
        { voiLUTFunction: VOILUTFunctionType.LINEAR_EXACT, voiLUT },
        presentation
      );

      viewport.element.addEventListener(Events.VOI_MODIFIED, (event) =>
        details.push(event.detail)
      );
      viewport.notifyDataPresentationModified(dataId, { voiRange: exactRange });
    }

    expect(details).toMatchObject([
      {
        VOILUTFunction: VOILUTFunctionType.LINEAR_EXACT,
        voiLUTSequenceApplied: true,
      },
      // A colormap replaces the sequence.
      {
        VOILUTFunction: VOILUTFunctionType.LINEAR_EXACT,
        voiLUTSequenceApplied: false,
      },
    ]);
  });
});
