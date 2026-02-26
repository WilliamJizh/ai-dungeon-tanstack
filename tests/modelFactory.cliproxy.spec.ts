import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeModel = {
  specificationVersion: 'v3';
  provider: string;
  modelId: string;
  doGenerate: ReturnType<typeof vi.fn>;
  doStream: ReturnType<typeof vi.fn>;
};

let activeModel: FakeModel;

const createOpenRouterMock = vi.fn(() => {
  return vi.fn(() => activeModel);
});

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: createOpenRouterMock,
}));

function createFakeModel(): FakeModel {
  return {
    specificationVersion: 'v3',
    provider: 'openrouter',
    modelId: 'claude-sonnet-4-6',
    doGenerate: vi.fn(async () => ({
      text: 'ok',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'tc-content-1',
          toolName: 'proxy_frameBuilderTool',
          input: {
            nested: '{"scene":"居官位"}',
          },
        },
      ],
      toolCalls: [
        {
          toolCallId: 'tc-1',
          toolName: 'proxy_frameBuilderTool',
          args: {
            payload: '{"text":"封粿胶套"}',
            untouched: '癌熱',
          },
        },
      ],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: undefined,
      request: {},
      response: {
        id: 'resp-1',
        modelId: 'claude-sonnet-4-6',
        timestamp: new Date(),
        messages: [],
      },
      providerMetadata: undefined,
    })),
    doStream: vi.fn(async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start' });
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { totalTokens: 0 } });
          controller.close();
        },
      }),
      request: {},
      response: {
        id: 'resp-stream',
        modelId: 'claude-sonnet-4-6',
        timestamp: new Date(),
      },
    })),
  };
}

async function loadModelFactory(forceNonStream?: string) {
  vi.resetModules();
  process.env.AI_PROVIDER = 'cliproxy';
  if (forceNonStream == null) {
    delete process.env.CLIPROXY_FORCE_NON_STREAM;
  } else {
    process.env.CLIPROXY_FORCE_NON_STREAM = forceNonStream;
  }
  return import('../server/lib/modelFactory.ts');
}

describe('cliproxy storyteller non-stream behavior', () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalForceNonStream = process.env.CLIPROXY_FORCE_NON_STREAM;

  beforeEach(() => {
    activeModel = createFakeModel();
    createOpenRouterMock.mockClear();
  });

  afterEach(() => {
    process.env.AI_PROVIDER = originalProvider;
    if (originalForceNonStream == null) {
      delete process.env.CLIPROXY_FORCE_NON_STREAM;
    } else {
      process.env.CLIPROXY_FORCE_NON_STREAM = originalForceNonStream;
    }
  });

  it('uses doGenerate for storyteller stream by default', async () => {
    const { getCliProxyModel } = await loadModelFactory();
    const model = getCliProxyModel('storyteller') as any;

    await model.doStream({ prompt: [] });

    expect(activeModel.doGenerate).toHaveBeenCalledTimes(1);
    expect(activeModel.doStream).not.toHaveBeenCalled();
  });

  it('keeps real doStream for planning role', async () => {
    const { getCliProxyModel } = await loadModelFactory();
    const model = getCliProxyModel('planning') as any;

    await model.doStream({ prompt: [] });

    expect(activeModel.doStream).toHaveBeenCalledTimes(1);
    expect(activeModel.doGenerate).not.toHaveBeenCalled();
  });

  it('supports disabling forced non-stream via env flag', async () => {
    const { getCliProxyModel } = await loadModelFactory('false');
    const model = getCliProxyModel('storyteller') as any;

    await model.doStream({ prompt: [] });

    expect(activeModel.doStream).toHaveBeenCalledTimes(1);
    expect(activeModel.doGenerate).not.toHaveBeenCalled();
  });

  it('normalizes cliproxy tool calls without corrupting CJK text', async () => {
    const { getCliProxyModel } = await loadModelFactory();
    const model = getCliProxyModel('storyteller') as any;

    const result = await model.doGenerate({ prompt: [] });

    expect(result.toolCalls[0].toolName).toBe('frameBuilderTool');
    expect(result.toolCalls[0].args.payload).toEqual({ text: '封粿胶套' });
    expect(result.toolCalls[0].args.untouched).toBe('癌熱');

    expect(result.content[0].toolName).toBe('frameBuilderTool');
    expect(result.content[0].input.nested).toEqual({ scene: '居官位' });
  });
});
