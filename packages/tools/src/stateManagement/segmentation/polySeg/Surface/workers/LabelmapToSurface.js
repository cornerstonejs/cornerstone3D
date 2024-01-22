import { expose } from 'comlink';
import ICRPolySeg from '@icr/polyseg-wasm';

const obj = {
  polySeg: {},
  async compute(args, ...callbacks) {
    const [progressCallback] = callbacks;
    const polySeg = await new ICRPolySeg();
    await polySeg.initialize({
      updateProgress: progressCallback,
    });

    const results = polySeg.instance.convertLabelmapToSurface(
      args.scalarData,
      args.dimensions,
      args.spacing,
      args.direction,
      args.origin,
      [args.segmentIndex]
    );
    return results;
  },
};

expose(obj);
