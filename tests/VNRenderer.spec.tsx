import { describe, it } from 'vitest';

describe('VNRenderer', () => {
  it.todo('renders first frame on mount');
  it.todo('advances to second frame on SPACE key');
  it.todo('does not advance past last frame without callback');
  it.todo('calls onChoiceSelect on choice click, advances frame');
  it.todo('calls onFreeTextSubmit and shows loading state');
  it.todo('shows loading indicator while awaiting next frames');
  it.todo('renders new frames after API response arrives');
  it.todo('resolves all asset keys to data URLs before rendering');
  it.todo('applies frame.effects on render, removes after durationMs');
  it.todo('fires onSceneComplete when TellOutput.sceneComplete=true');
});
