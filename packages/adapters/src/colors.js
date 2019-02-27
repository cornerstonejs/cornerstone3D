//
// Handle DICOM and CIELAB colors
// based on:
// https://github.com/michaelonken/dcmtk/blob/3c68f0e882e22e6d9e2a42f836332c0ca21b3e7f/dcmiod/libsrc/cielabutil.cc
//
// RGB here refers to sRGB 0-1 per component.
// dicomlab is CIELAB values as defined in the dicom standard
// XYZ is CIEXYZ convention
//
// TODO: needs a test suite
// TODO: only dicomlab2RGB tested on real data
//
//

class Colors {
    static d65WhitePointXYZ() {
        // white points of D65 light point (CIELAB standard white point)
        return [0.950456, 1.0, 1.088754];
    }

    static dicomlab2RGB(dicomlab) {
        return Colors.lab2RGB(Colors.dicomlab2LAB(dicomlab));
    }

    static rgb2DICOMLAB(rgb) {
        return Colors.lab2DICOMLAB(Colors.rgb2LAB(rgb));
    }

    static dicomlab2LAB(dicomlab) {
        return [
            (dicomlab[0] * 100.0) / 65535.0, // results in 0 <= L <= 100
            (dicomlab[1] * 255.0) / 65535.0 - 128, // results in -128 <= a <= 127
            (dicomlab[2] * 255.0) / 65535.0 - 128 // results in -128 <= b <= 127
        ];
    }

    static lab2DICOMLAB(lab) {
        return [
            (lab[0] * 65535.0) / 100.0, // results in 0 <= L <= 65535
            ((lab[1] + 128) * 65535.0) / 255.0, // results in 0 <= a <= 65535
            ((lab[2] + 128) * 65535.0) / 255.0 // results in 0 <= b <= 65535
        ];
    }

    static rgb2LAB(rgb) {
        return Colors.xyz2LAB(Colors.rgb2XYZ(rgb));
    }

    static gammaCorrection(n) {
        if (n <= 0.0031306684425005883) {
            return 12.92 * n;
        } else {
            return 1.055 * Math.pow(n, 0.416666666666666667) - 0.055;
        }
    }

    static invGammaCorrection(n) {
        if (n <= 0.0404482362771076) {
            return n / 12.92;
        } else {
            return Math.pow((n + 0.055) / 1.055, 2.4);
        }
    }

    static rgb2XYZ(rgb) {
        let R = Colors.invGammaCorrection(rgb[0]);
        let G = Colors.invGammaCorrection(rgb[1]);
        let B = Colors.invGammaCorrection(rgb[2]);
        return [
            0.4123955889674142161 * R +
                0.3575834307637148171 * G +
                0.1804926473817015735 * B,
            0.2125862307855955516 * R +
                0.7151703037034108499 * G +
                0.07220049864333622685 * B,
            0.01929721549174694484 * R +
                0.1191838645808485318 * G +
                0.950497125131579766 * B
        ];
    }

    static xyz2LAB(xyz) {
        let whitePoint = Colors.d65WhitePointXYZ();
        let X = xyz[0] / whitePoint[0];
        let Y = xyz[1] / whitePoint[1];
        let Z = xyz[2] / whitePoint[2];
        X = Colors.labf(X);
        Y = Colors.labf(Y);
        Z = Colors.labf(Z);
        return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    }

    static lab2RGB(lab) {
        return Colors.xyz2RGB(Colors.lab2XYZ(lab));
    }

    static lab2XYZ(lab) {
        let L = (lab[0] + 16) / 116;
        let a = L + lab[1] / 500;
        let b = L - lab[2] / 200;
        let whitePoint = Colors.d65WhitePointXYZ();
        return [
            whitePoint[0] * Colors.labfInv(a),
            whitePoint[1] * Colors.labfInv(L),
            whitePoint[2] * Colors.labfInv(b)
        ];
    }

    static xyz2RGB(xyz) {
        let R1 = 3.2406 * xyz[0] - 1.5372 * xyz[1] - 0.4986 * xyz[2];
        let G1 = -0.9689 * xyz[0] + 1.8758 * xyz[1] + 0.0415 * xyz[2];
        let B1 = 0.0557 * xyz[0] - 0.204 * xyz[1] + 1.057 * xyz[2];

        /* Force nonnegative values so that gamma correction is well-defined. */
        let minimumComponent = Math.min(R1, G1);
        minimumComponent = Math.min(minimumComponent, B1);
        if (minimumComponent < 0) {
            R1 -= minimumComponent;
            G1 -= minimumComponent;
            B1 -= minimumComponent;
        }

        /* Transform from RGB to R'G'B' */
        return [
            Colors.gammaCorrection(R1),
            Colors.gammaCorrection(G1),
            Colors.gammaCorrection(B1)
        ];
    }

    static labf(n) {
        if (n >= 8.85645167903563082e-3) {
            return Math.pow(n, 0.333333333333333);
        } else {
            return (841.0 / 108.0) * n + 4.0 / 29.0;
        }
    }

    static labfInv(n) {
        if (n >= 0.206896551724137931) {
            return n * n * n;
        } else {
            return (108.0 / 841.0) * (n - 4.0 / 29.0);
        }
    }
}

export { Colors };
export default Colors;
