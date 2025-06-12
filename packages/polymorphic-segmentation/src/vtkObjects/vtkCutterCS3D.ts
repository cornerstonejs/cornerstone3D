import * as macro from '@kitware/vtk.js/macros';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
const { vtkErrorMacro } = macro;

// ----------------------------------------------------------------------------
// Helper: iterate over polygons and strips
// ----------------------------------------------------------------------------
function initPolyIterator(pd) {
  const polys = pd.getPolys().getData();
  const strips = pd.getStrips().getData();
  const it = {
    cellSize: 0,
    cell: [],
    done: false,
    polyIdx: 0,
    stripIdx: 0,
    remainingStripLength: 0,
  };
  it.next = function () {
    if (it.polyIdx < polys.length) {
      it.cellSize = polys[it.polyIdx++];
      it.cell = polys.slice(it.polyIdx, it.polyIdx + it.cellSize);
      it.polyIdx += it.cellSize;
    } else if (it.stripIdx < strips.length) {
      if (it.remainingStripLength === 0) {
        it.remainingStripLength = strips[it.stripIdx++] - 2;
      }
      it.cellSize = 3;
      it.cell = strips.slice(it.stripIdx - 1, it.stripIdx + 2);
      it.stripIdx++;
      it.remainingStripLength--;
    } else if (!it.done) {
      it.done = true;
    } else {
      throw new Error('Iterator is done');
    }
  };
  it.next();
  return it;
}

// ----------------------------------------------------------------------------
// vtkCutterCS3D implementation (lines-only output)
// ----------------------------------------------------------------------------
function vtkCutterCS3D(publicAPI, model) {
  model.classHierarchy.push('vtkCutterCS3D');
  const superClass = { ...publicAPI };

  publicAPI.getMTime = () => {
    let mTime = superClass.getMTime();
    if (model.cutFunction) {
      mTime = Math.max(mTime, model.cutFunction.getMTime());
    }
    return mTime;
  };

  function dataSetCutter(input, output) {
    const pts = input.getPoints();
    const pd = pts.getData();
    const nPts = pts.getNumberOfPoints();
    const newPoints = [];
    const newLines = [];

    // Evaluate scalar at each input point
    if (!model.cutScalars || model.cutScalars.length < nPts) {
      model.cutScalars = new Float32Array(nPts);
    }
    for (let i = 0; i < nPts; i++) {
      const x = pd[3 * i],
        y = pd[3 * i + 1],
        z = pd[3 * i + 2];
      model.cutScalars[i] = model.cutFunction.evaluateFunction(x, y, z);
    }

    // Global point map to avoid duplicates across cells
    const globalPointMap = new Map();
    const globalLineMap = new Set();
    const tolerance = 1e-3; // More reasonable tolerance for 3D coordinates

    // Helper function to get or create point ID using distance-based deduplication
    function getOrCreatePointId(point) {
      // Check if a similar point already exists within tolerance
      for (let i = 0; i < newPoints.length; i += 3) {
        const dx = newPoints[i] - point[0];
        const dy = newPoints[i + 1] - point[1];
        const dz = newPoints[i + 2] - point[2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < tolerance * tolerance) {
          return Math.floor(i / 3); // Return existing point ID
        }
      }

      // No similar point found, add new point
      const pointId = newPoints.length / 3;
      newPoints.push(...point);
      return pointId;
    }

    // Helper function to check if line segment already exists
    function addUniqueLineSegment(id1, id2) {
      const lineKey1 = `${Math.min(id1, id2)}_${Math.max(id1, id2)}`;
      if (!globalLineMap.has(lineKey1)) {
        globalLineMap.add(lineKey1);
        newLines.push(2, id1, id2);
      }
    }

    // Process each cell: output only line segments for intersection
    for (const it = initPolyIterator(input); !it.done; it.next()) {
      if (it.cellSize < 2) {
        continue;
      }

      // Gather scalars and side flags
      const scal = it.cell.map((pid) => model.cutScalars[pid]);
      const above = scal.map((v) => v > model.cutValue);
      if (above.every((v) => v) || above.every((v) => !v)) {
        continue;
      }

      // Find intersections on each edge
      const inters = [];
      for (let ei = 0; ei < it.cellSize; ei++) {
        const ej = (ei + 1) % it.cellSize;
        const v0 = scal[ei],
          v1 = scal[ej];
        if (v0 > model.cutValue === v1 > model.cutValue) {
          continue;
        }
        // interpolate param
        const t = (model.cutValue - v0) / (v1 - v0);
        const pid0 = it.cell[ei],
          pid1 = it.cell[ej];
        const p0i = 3 * pid0,
          p1i = 3 * pid1;
        const ip = [
          pd[p0i] + t * (pd[p1i] - pd[p0i]),
          pd[p0i + 1] + t * (pd[p1i + 1] - pd[p0i + 1]),
          pd[p0i + 2] + t * (pd[p1i + 2] - pd[p0i + 2]),
        ];
        inters.push({ ip, edgeIndex: ei });
      }
      if (inters.length < 2) {
        continue;
      }

      // Sort by edge order
      inters.sort((a, b) => a.edgeIndex - b.edgeIndex);

      // Get or create point IDs using global map to avoid duplicates
      const ids = inters.map((I) => getOrCreatePointId(I.ip));

      // Remove consecutive duplicate IDs within this cell
      const uniqueIds = [];
      for (let i = 0; i < ids.length; i++) {
        if (i === 0 || ids[i] !== ids[i - 1]) {
          uniqueIds.push(ids[i]);
        }
      }

      // For surface cutting, we should only connect intersection points that form
      // a proper contour segment. In most cases, a cell should have exactly 2 intersections
      // that represent entry and exit points of the cutting plane.
      if (uniqueIds.length === 2) {
        // Standard case: cutting plane enters and exits the cell
        addUniqueLineSegment(uniqueIds[0], uniqueIds[1]);
      } else if (uniqueIds.length > 2) {
        // Complex case: multiple intersections - connect pairs to avoid internal lines
        // Connect first to second, and if there are more, connect them in pairs
        for (let k = 0; k < uniqueIds.length - 1; k += 2) {
          if (k + 1 < uniqueIds.length && uniqueIds[k] !== uniqueIds[k + 1]) {
            addUniqueLineSegment(uniqueIds[k], uniqueIds[k + 1]);
          }
        }
      }
    }

    // Set output
    const outPts = output.getPoints();
    outPts.setData(macro.newTypedArrayFrom(pts.getDataType(), newPoints), 3);
    if (newLines.length) {
      output.getLines().setData(Uint16Array.from(newLines));
    }
  }

  publicAPI.requestData = (inData, outData) => {
    const input = inData[0];
    if (!input) {
      return vtkErrorMacro('Invalid input');
    }
    if (!model.cutFunction) {
      return vtkErrorMacro('Missing cut function');
    }
    const output = vtkPolyData.newInstance();
    dataSetCutter(input, output);
    outData[0] = output;
  };
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------
const DEFAULT_VALUES = { cutFunction: null, cutScalars: null, cutValue: 0.0 };
export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);
  macro.obj(publicAPI, model);
  macro.algo(publicAPI, model, 1, 1);
  macro.setGet(publicAPI, model, ['cutFunction', 'cutValue']);
  vtkCutterCS3D(publicAPI, model);
}
export const newInstance = macro.newInstance(extend, 'vtkCutterCS3D');
export default { newInstance, extend };
