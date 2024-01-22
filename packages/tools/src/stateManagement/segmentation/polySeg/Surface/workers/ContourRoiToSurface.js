import { expose } from 'comlink';
import ICRPolySeg from '@icr/polyseg-wasm';

const obj = {
  polySeg: {},
  async compute(args, ...callbacks) {
    const { polylines, numPointsArray } = args;
    const [progressCallback] = callbacks;
    const polySeg = await new ICRPolySeg();
    await polySeg.initialize({
      updateProgress: progressCallback,
    });
    const results = await polySeg.instance.convertContourRoiToSurface(
      polylines,
      numPointsArray
    );

    return results;
  },
};

expose(obj);
