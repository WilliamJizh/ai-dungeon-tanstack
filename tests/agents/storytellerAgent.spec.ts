import { describe, it } from 'vitest';

describe('Storyteller Agent', () => {
  it.todo('collects VNFrame[] from frameBuilderTool results in steps');
  it.todo('every frame passes VNFrameSchema validation');
  it.todo('uses only asset keys present in available pack');
  it.todo('advances beatIndex by at least 1 per turn');
  it.todo('sets sceneComplete=true when sceneCompleteTool called');
  it.todo('returns no more than 5 frames per turn');
});
