import RenderingEngine from './RenderingEngine';

const cache = new Map();

export default {
  get: (uid: string) => {
    return cache.get(uid);
  },
  set: (uid: string, re: RenderingEngine) => {
    return cache.set(uid, re);
  },
  delete: (uid: string) => {
    return cache.delete(uid);
  },
};
