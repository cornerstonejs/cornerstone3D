import ndarray from "ndarray";
import warp from "ndarray-warp";

/**
 * anonymous function - Rotates a matrix by theta degrees.
 *
 * @param  {Ndarray} matrix The matrix to rotate.
 * @param  {Number} theta  The angle to rotate the matrix by in radians.
 * @return {Ndarry}        The rotated matrix.
 */
export default function(matrix, theta) {
    const [rows, cols] = matrix.shape;

    console.log(imageRotate);
    debugPrintMatrix(matrix);

    const result = ndarray(new Uint8Array(rows * cols), [rows, cols]);

    rotateImage(result, matrix, theta);

    debugPrintMatrix(result);

    return result;
}

/**
 * rotateImage - Rotates a 2D image and returns the result in a new 2D array.
 * (Pulled from scijs/image-rotate)
 *
 * @param  {type} out   The output array.
 * @param  {type} inp   The input array
 * @param  {type} theta The angle.
 * @param  {type} iX    The X position to rotate about.
 * @param  {type} iY    The Y position to rotate about.
 * @param  {type} oX    The X position of the center of the output.
 * @param  {type} oY    The X position of the center of the output.
 * @return {type}       The output array.
 */
function rotateImage(out, inp, theta, iX, iY, oX, oY) {
    var c = Math.cos(theta);
    var s = Math.sin(-theta);
    iX = iX || (inp.shape[0] - 1) / 2.0;
    iY = iY || (inp.shape[1] - 1) / 2.0;
    oX = oX || (out.shape[0] - 1) / 2.0;
    oY = oY || (out.shape[1] - 1) / 2.0;
    var a = iX - c * oX + s * oY;
    var b = iY - s * oX - c * oY;
    /*
  warp(out, inp, function(y, x) {
    y[0] = c * x[0] - s * x[1] + a;
    y[1] = s * x[0] + c * x[1] + b;
  });
  */
    return out;
}

function debugPrintMatrix(m) {
    console.log(`shape: (${m.shape[0]}, ${m.shape[1]})`);

    for (let i = 0; i < m.shape[0]; i++) {
        let row = "";
        for (let j = 0; j < m.shape[1]; j++) {
            row += `${m.get(i, j)} `;
        }
        console.log(row);
    }
}
