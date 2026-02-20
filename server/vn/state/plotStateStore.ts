import type { PlotState } from '../types/vnTypes.js';

/** In-memory cache of active plot states. */
const store = new Map<string, PlotState>();

export const plotStateStore = {
  get: store.get.bind(store),
  set: store.set.bind(store),
  has: store.has.bind(store),
};
