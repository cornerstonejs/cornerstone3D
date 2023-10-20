import assetsURL from '../../assets/assetsURL.json';

export default function downloadSurfaces() {
  const lung13Promise = fetch(assetsURL.SurfaceLung13).then((res) =>
    res.json()
  );
  const lung14Promise = fetch(assetsURL.SurfaceLung14).then((res) =>
    res.json()
  );
  const lung15Promise = fetch(assetsURL.SurfaceLung15).then((res) =>
    res.json()
  );
  const lung16Promise = fetch(assetsURL.SurfaceLung16).then((res) =>
    res.json()
  );
  const lung17Promise = fetch(assetsURL.SurfaceLung17).then((res) =>
    res.json()
  );

  return Promise.all([
    lung13Promise,
    lung14Promise,
    lung15Promise,
    lung16Promise,
    lung17Promise,
  ]);
}
