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

      // Create a local map to assign new point IDs
      const localMap = new Map();
      const ids = [];
      inters.forEach((I) => {
        const key = `${I.edgeIndex}`; // unique per intersection
        if (!localMap.has(key)) {
          localMap.set(key, newPoints.length / 3);
          newPoints.push(...I.ip);
        }
        ids.push(localMap.get(key));
      });

      // Emit segments between consecutive intersection points
      for (let k = 1; k < ids.length; k++) {
        newLines.push(2, ids[k - 1], ids[k]);
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
