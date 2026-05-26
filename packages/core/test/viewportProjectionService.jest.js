import {
  ViewportProjectionService,
  viewportProjection,
} from '../src/RenderingEngine/GenericViewport';
import { ViewportType } from '../src/enums';

function createAdapter(id, viewportTypes = ['testViewport']) {
  return {
    id,
    viewportTypes,
    getSnapshot: jest.fn((request) => ({
      adapterId: id,
      kind: id,
      presentation: {
        requestedDataId: request.dataId,
      },
      spaces: {},
      viewportType: request.viewportType ?? request.viewport?.type,
    })),
    getPresentation: jest.fn((snapshot) => ({
      adapterId: snapshot.adapterId,
      requestedDataId: snapshot.presentation.requestedDataId,
    })),
    withPresentation: jest.fn((_snapshot, presentation) => ({
      adapterId: id,
      presentation,
    })),
  };
}

describe('ViewportProjectionService', () => {
  it('registers built-in projection adapters with the package service', () => {
    const adapterIds = viewportProjection
      .getRegisteredAdapters()
      .map((adapter) => adapter.id);

    expect(adapterIds).toEqual(expect.arrayContaining(['planar', 'volume3d']));
    expect(
      viewportProjection.getAdapter({
        type: ViewportType.PLANAR_NEXT,
      })?.id
    ).toBe('planar');
    expect(
      viewportProjection.getAdapter({
        type: ViewportType.VOLUME_3D_NEXT,
      })?.id
    ).toBe('volume3d');
  });

  it('selects custom adapters by viewport type and optional kind', () => {
    const service = new ViewportProjectionService();
    const firstAdapter = createAdapter('firstProjection');
    const secondAdapter = createAdapter('secondProjection');
    const viewport = { type: 'testViewport' };

    service.register(firstAdapter);
    service.register(secondAdapter);

    expect(service.get(viewport).adapterId).toBe('firstProjection');
    expect(
      service.get(viewport, {
        kind: 'secondProjection',
        dataId: 'target-data',
      }).adapterId
    ).toBe('secondProjection');
    expect(secondAdapter.getSnapshot).toHaveBeenCalledWith({
      kind: 'secondProjection',
      dataId: 'target-data',
      viewport,
    });
  });

  it('uses explicit viewportType requests for adapter lookup', () => {
    const service = new ViewportProjectionService();
    const adapter = createAdapter('externalProjection', ['externalViewport']);

    service.register(adapter);

    const snapshot = service.get(
      {},
      {
        viewportType: 'externalViewport',
      }
    );

    expect(snapshot.adapterId).toBe('externalProjection');
    expect(snapshot.viewportType).toBe('externalViewport');
  });

  it('returns presentation and semantic state through the selected adapter', () => {
    const service = new ViewportProjectionService();
    const adapter = createAdapter('stateProjection');
    const viewport = { type: 'testViewport' };

    service.register(adapter);

    expect(
      service.getPresentation(viewport, {
        dataId: 'presentation-data',
      })
    ).toEqual({
      adapterId: 'stateProjection',
      requestedDataId: 'presentation-data',
    });
    expect(
      service.withPresentation(viewport, {
        zoom: 2,
      })
    ).toEqual({
      adapterId: 'stateProjection',
      presentation: {
        zoom: 2,
      },
    });
  });

  it('can unregister and clear custom adapters', () => {
    const service = new ViewportProjectionService();
    const firstAdapter = createAdapter('firstProjection');
    const secondAdapter = createAdapter('secondProjection');
    const viewport = { type: 'testViewport' };

    service.register(firstAdapter);
    service.register(secondAdapter);

    expect(service.getRegisteredAdapters()).toHaveLength(2);

    service.unregister('firstProjection');

    expect(service.get(viewport).adapterId).toBe('secondProjection');

    service.clear();

    expect(service.get(viewport)).toBeUndefined();
    expect(service.getRegisteredAdapters()).toHaveLength(0);
  });
});
