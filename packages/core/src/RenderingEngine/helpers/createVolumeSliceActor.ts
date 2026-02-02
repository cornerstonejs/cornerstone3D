import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

import type { ImageActor } from './../../types/IActor';
import type { VoiModifiedEventDetail } from './../../types/EventTypes';
import { loadVolume } from '../../loaders/volumeLoader';
import triggerEvent from '../../utilities/triggerEvent';
import { Events } from '../../enums';
import eventTarget from '../../eventTarget';
import setDefaultVolumeVOI from './setDefaultVolumeVOI';

const VOLUME_LOAD_POLL_INTERVAL_MS = 50;
const VOLUME_LOAD_TIMEOUT_MS = 30000;

interface createVolumeSliceActorInterface {
  volumeId: string;
  callback?: ({
    volumeActor,
    volumeId,
  }: {
    volumeActor: ImageActor;
    volumeId: string;
  }) => void;
}

async function createVolumeSliceActor(
  props: createVolumeSliceActorInterface,
  element: HTMLDivElement,
  viewportId: string,
  suppressEvents = false
): Promise<{ actor: ImageActor; slicePlane: vtkPlane }> {
  const { volumeId, callback } = props;

  const imageVolume = await loadVolume(volumeId);

  if (!imageVolume) {
    throw new Error(`imageVolume with id: ${volumeId} does not exist`);
  }

  const { imageData } = imageVolume;
  const pointData = imageData.getPointData();
  let scalars = pointData.getScalars();

  if (!scalars || scalars.getNumberOfTuples() === 0) {
    await waitForVolumeLoad(volumeId, imageVolume);

    const voxelManager = imageVolume.voxelManager;
    if (!voxelManager?.getCompleteScalarDataArray) {
      throw new Error(
        `Volume ${volumeId} does not provide scalar data for reslice rendering`
      );
    }

    const values = voxelManager.getCompleteScalarDataArray();
    if (!values || values.length === 0) {
      throw new Error(
        `Volume ${volumeId} does not have scalar data available for reslice rendering`
      );
    }
    const { numberOfComponents } = imageData.get('numberOfComponents') as {
      numberOfComponents: number;
    };

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      values,
      numberOfComponents: numberOfComponents || 1,
    });

    pointData.setScalars(scalarArray);
    pointData.modified();
    imageData.modified();
    scalars = scalarArray;
  }

  const slicePlane = vtkPlane.newInstance();
  const mapper = vtkImageResliceMapper.newInstance();
  mapper.setInputData(imageData);
  mapper.setSlicePlane(slicePlane);
  mapper.setSlabThickness(0);
  mapper.modified();

  const actor = vtkImageSlice.newInstance();
  actor.setMapper(mapper);

  if (scalars && scalars.getNumberOfComponents() > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  const imageProperty = actor.getProperty();
  imageProperty.set({ viewportId: viewportId }, true);

  await setDefaultVolumeVOI(actor, imageVolume);

  if (actor.getClassName && actor.getClassName() === 'vtkImageSlice') {
    const defaultWindow = imageProperty.getColorWindow?.();
    const defaultLevel = imageProperty.getColorLevel?.();
    if (defaultWindow === 255 && defaultLevel === 127.5) {
      const scalarRange = imageData.getPointData().getScalars()?.getRange?.();
      if (scalarRange?.length === 2) {
        imageProperty.setColorWindow(scalarRange[1] - scalarRange[0]);
        imageProperty.setColorLevel((scalarRange[1] + scalarRange[0]) / 2);
      }
    }
  }

  if (callback) {
    callback({ volumeActor: actor, volumeId });
  }

  if (!suppressEvents) {
    triggerVOIModified(element, viewportId, actor, volumeId);
  }

  return { actor, slicePlane };
}

async function waitForVolumeLoad(
  volumeId: string,
  imageVolume: {
    load?: (callback?: (...args: unknown[]) => void) => void;
    loadStatus?: { loaded?: boolean; loading?: boolean };
  }
): Promise<void> {
  const { loadStatus } = imageVolume;

  if (!loadStatus || loadStatus.loaded) {
    return;
  }

  if (!loadStatus.loading && typeof imageVolume.load === 'function') {
    imageVolume.load(() => {});
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      eventTarget.removeEventListener(
        Events.IMAGE_VOLUME_LOADING_COMPLETED,
        onComplete
      );
      resolve();
    };

    const onComplete = (evt: Event) => {
      const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;
      if (!detail || detail.volumeId !== volumeId) {
        return;
      }
      cleanup();
    };

    const intervalId = setInterval(() => {
      if (loadStatus.loaded) {
        cleanup();
      }
    }, VOLUME_LOAD_POLL_INTERVAL_MS);

    const timeoutId = setTimeout(() => {
      cleanup();
    }, VOLUME_LOAD_TIMEOUT_MS);

    if (loadStatus.loaded) {
      cleanup();
      return;
    }

    eventTarget.addEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      onComplete
    );
  });
}

function triggerVOIModified(
  element: HTMLDivElement,
  viewportId: string,
  actor: ImageActor,
  volumeId: string
) {
  const voiRange = actor.getProperty().getRGBTransferFunction(0).getRange();

  const voiModifiedEventDetail: VoiModifiedEventDetail = {
    viewportId,
    range: {
      lower: voiRange[0],
      upper: voiRange[1],
    },
    volumeId,
  };

  triggerEvent(element, Events.VOI_MODIFIED, voiModifiedEventDetail);
}

export default createVolumeSliceActor;
