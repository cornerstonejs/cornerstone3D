import french from './colormaps/french';

const generateColorMap = (name: string, points: number[][]) => {
    let rgbPoints: Array<number> = []
    points.forEach((point, i) => {
        rgbPoints.push((i / 255), (point[0] / 255), (point[1] / 255), (point[2] / 255))
    })

    return {
        ColorSpace: 'RGB',
        Name: name,
        RGBPoints: rgbPoints
    }

}

export const getColorMaps = () => {
    const colormaps = {
        french: french,
    }
    return Object.entries(colormaps).map(([name, colormap]) => generateColorMap(name, colormap))
}
