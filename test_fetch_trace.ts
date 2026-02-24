import { getTraceById } from './server/debug/traceStore.js';
import util from 'util';

const t = getTraceById('db68d873-8c5e-43e4-bdcf-f77311d20e4e');
console.log(util.inspect(t, { depth: null, colors: true }));
