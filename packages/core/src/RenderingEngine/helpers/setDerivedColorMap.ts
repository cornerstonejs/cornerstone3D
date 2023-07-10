import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

export default function setDerivedColorMap(actor) {
  const properties = actor.getProperty();
  const opacity = 0.9;

  const opacity_tf = vtkPiecewiseFunction.newInstance();
  const color_tf = vtkColorTransferFunction.newInstance();

  color_tf.addRGBPoint(0, 0, 0, 0);
  opacity_tf.addPoint(0, 0);

  color_tf.addRGBPoint(1, 255, 0, 0);
  opacity_tf.addPoint(1, opacity);

  color_tf.addRGBPoint(2, 0, 255, 0);
  opacity_tf.addPoint(2, opacity);

  color_tf.addRGBPoint(3, 0, 0, 255);
  opacity_tf.addPoint(3, opacity);

  properties.setRGBTransferFunction(0, color_tf);
  properties.setScalarOpacity(0, opacity_tf);
}
