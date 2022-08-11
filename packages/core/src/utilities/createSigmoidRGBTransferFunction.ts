import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import { VOIRange } from '../types';

/**
 * A utility that can be used to generate an RgbTransferFunction
 *
 * @example
 * Setting an RGB Transfer function from the viewport:
 * ```
 * const sigmoidRGBTransferFunction = createSigmoidRGBTransferFunction(0, 255, { lower: 0, upper: 255} );
 * viewport
 *   .getActor()
 *   .getProperty()
 *   .setRGBTransferFunction(0, sigmoidRGBTransferFunction);
 * ```
 *
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_ColorTransferFunction.html|VTK.js: ColorTransferFunction}
 * @param rgbTransferFunction
 */
 export default function createSigmoidRGBTransferFunction(
    windowWidth: number,
    windowCenter: number,
    voiRange: VOIRange
  ): vtkColorTransferFunction {
    const cfun = vtkColorTransferFunction.newInstance();
    const sigmoid = (x:number, wc:number, ww:number)=> 1/(1+Math.exp(-4*(x-wc)/ww))
    const range = (start: number, end: number) => { return [...Array(1+end-start).keys()].map(v => start+v) }
    const values = range(voiRange.lower, voiRange.upper)
    const table = values.map(x=>{ return sigmoid(x, windowCenter, windowWidth) }).reduce(function (res, x) {
        return res.concat([x, x, x]);
    }, []);

    cfun.buildFunctionFromTable(voiRange.lower, voiRange.upper, values.length, table)

    return cfun
  }
