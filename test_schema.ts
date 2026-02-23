import { zodToJsonSchema } from 'zod-to-json-schema';
import { VNFrameSchema } from './server/vn/types/vnFrame.js';

const FrameInputSchema = VNFrameSchema.omit({ _meta: true });
const jsonSchema = zodToJsonSchema(FrameInputSchema, 'FrameInputSchema');

console.log(JSON.stringify(jsonSchema, null, 2));
