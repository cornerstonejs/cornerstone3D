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
    { planesInfo, pointsAndPolys },
    progressCallback,
    updateCacheCallback
  ) {
    const numberOfPlanes = planesInfo.length;
    const clippingFilter = vtkClipClosedSurface.newInstance({
      clippingPlanes: [],
      activePlaneId: 2,
      passPointData: false,
    });
    clippingFilter.setGenerateOutline(true);
    clippingFilter.setGenerateFaces(false);

    const plane1 = vtkPlane.newInstance();
    const plane2 = vtkPlane.newInstance();

    try {
      for (const [index, planeInfo] of planesInfo.entries()) {
        const { sliceIndex, planes } = planeInfo;

        const polyDataResults = new Map();
        for (const polyDataInfo of pointsAndPolys) {
          const { points, polys, id } = polyDataInfo;

          const surfacePolyData = vtkPolyData.newInstance();
          surfacePolyData.getPoints().setData(points, 3);
          surfacePolyData.getPolys().setData(polys, 3);

          clippingFilter.setInputData(surfacePolyData);

          // Reusable array for clipping planes
          const clippingPlanes = [plane1, plane2];

          // Directly update plane instances
          plane1.setOrigin(planes[0].origin);
          plane1.setNormal(planes[0].normal);
          plane2.setOrigin(planes[1].origin);
          plane2.setNormal(planes[1].normal);

          clippingFilter.setClippingPlanes(clippingPlanes);
          clippingFilter.update();

          const polyData = clippingFilter.getOutputData();

          if (polyData) {
            polyDataResults.set(id, {
              points: polyData.getPoints().getData(),
              lines: polyData.getLines().getData(),
            });
          }
        }

        progressCallback({ progress: (index + 1) / numberOfPlanes });

        updateCacheCallback({ sliceIndex, polyDataResults });
      }
    } catch (e) {
      console.error('Error during processing', e);
    } finally {
      // Cleanup on completion
      pointsAndPolys = null;
      clippingFilter.delete();
      plane1.delete();
      plane2.delete();
    }
  },
};

expose(obj);
