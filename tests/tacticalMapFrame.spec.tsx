// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LocaleProvider } from '../src/context/LocaleContext';
import { TacticalMapFrame } from '../src/components/vn/frames/TacticalMapFrame';
import { MOCK_PACK, PREVIEW_GROUPS } from '../src/lib/mockVNData';
import type { VNFrame } from '../server/vn/types/vnFrame';

// Mock ResizeObserver which is not available in jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

afterEach(() => cleanup());

// Get the tactical map frame from mock data
const tacticalGroup = PREVIEW_GROUPS.find((g) => g.label === 'TACTICAL MAP')!;
const tacticalFrame = tacticalGroup.variants[0].frame as VNFrame & { tacticalMapData: unknown };

function renderFrame() {
  return render(
    <LocaleProvider>
      <TacticalMapFrame
        frame={tacticalFrame}
        pack={MOCK_PACK}
        onCombatComplete={vi.fn()}
      />
    </LocaleProvider>,
  );
}

describe('TacticalMapFrame', () => {
  it('renders without throwing with valid tacticalMapData', () => {
    const { container } = renderFrame();
    expect(container.firstChild).not.toBeNull();
  });

  it('shows token icons in the output', () => {
    const { container } = renderFrame();
    const tokenElements = container.querySelectorAll('[data-token]');
    expect(tokenElements.length).toBeGreaterThan(0);
  });

  it('shows END TURN button', () => {
    const { container } = renderFrame();
    const buttons = Array.from(container.querySelectorAll('button'));
    const endTurnBtn = buttons.find((b) => b.textContent === 'END TURN');
    expect(endTurnBtn).toBeDefined();
  });

  it('shows combat log entries', () => {
    const { container } = renderFrame();
    expect(container.textContent).toContain('Combat begins');
  });

  it('shows RETREAT button', () => {
    const { container } = renderFrame();
    const buttons = Array.from(container.querySelectorAll('button'));
    const retreatBtn = buttons.find((b) => b.textContent?.includes('RETREAT'));
    expect(retreatBtn).toBeDefined();
  });

  it('shows round indicator', () => {
    const { container } = renderFrame();
    expect(container.textContent).toContain('ROUND');
  });
});
