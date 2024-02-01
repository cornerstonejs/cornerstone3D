import { expose } from 'comlink';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkClipClosedSurface from '@kitware/vtk.js/Filters/General/ClipClosedSurface';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

const obj = {
  /**
   * Clips a 3D surface using provided planes and updates the cache and progress.
   * The function takes in information about the planes and the polygon data, and applies a clipping filter.
   * It then updates the cache and progress based on the processed data.
   *
   * @param clipInfo - Contains information about the planes and the polygon data.
   * @param updateProgress - Callback function to update the progress of the clipping process.
   * @param updateCache - Callback function to update the cache with the clipped data.
   *
   * @throws Will throw an error if the clipping process encounters an issue.
   */
  clipSurfaceWithPlanes(
    { planesInfo, polyDataInfo },
    progressCallback,
    updateCacheCallback
  ) {
    const numberOfPlanes = planesInfo.length;

    const { points, polys } = polyDataInfo;

    const surfacePolyData = vtkPolyData.newInstance();
    surfacePolyData.getPoints().setData(points, 3);
    surfacePolyData.getPolys().setData(polys, 3);

    const clippingFilter = vtkClipClosedSurface.newInstance({
      clippingPlanes: [],
      activePlaneId: 2,
      passPointData: false,
    });
    clippingFilter.setInputData(surfacePolyData);
    clippingFilter.setGenerateOutline(true);
    clippingFilter.setGenerateFaces(false);

    const plane1 = vtkPlane.newInstance();
    const plane2 = vtkPlane.newInstance();

    // Reusable array for clipping planes
    const clippingPlanes = [plane1, plane2];

    try {
      for (const [index, planeInfo] of planesInfo.entries()) {
        const { sliceIndex, planes } = planeInfo;

        // Directly update plane instances
        plane1.setOrigin(planes[0].origin);
        plane1.setNormal(planes[0].normal);
        plane2.setOrigin(planes[1].origin);
        plane2.setNormal(planes[1].normal);

        clippingFilter.setClippingPlanes(clippingPlanes);
        clippingFilter.update();

        const polyData = clippingFilter.getOutputData();

        if (polyData) {
          const points = polyData.getPoints().getData();
          const lines = polyData.getLines().getData();
          updateCacheCallback({ sliceIndex, points, lines });
        }

        progressCallback({ progress: (index + 1) / numberOfPlanes });
      }
    } catch (e) {
      console.error('Error during processing', e);
    } finally {
      // Cleanup on completion
      surfacePolyData.delete();
      clippingFilter.delete();
      plane1.delete();
      plane2.delete();
    }
  },
};

expose(obj);
