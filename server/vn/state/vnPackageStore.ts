import type { VNPackage } from '../types/vnTypes.js';

/** In-memory cache of loaded VN packages. */
const store = new Map<string, VNPackage>();

export const vnPackageStore = {
  get: store.get.bind(store),
  set: store.set.bind(store),
  has: store.has.bind(store),
};
