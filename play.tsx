import 'dotenv/config';
import { randomUUID } from 'crypto';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { render, Box, Text, Static, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { db } from './server/db/index.js';
import { plotStates, vnPackages } from './server/db/schema.js';
import { eq } from 'drizzle-orm';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';
import type { VNPackage } from './server/vn/types/vnTypes.js';
import { compressContext, summarizeNodeInBackground, sanitizeHistory } from './server/vn/utils/contextCompressor.js';
import { startLLMTrace, getActiveModelInfo } from './server/lib/modelFactory.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RenderedFrame {
  id: string;
  index: number;
  type: string;
  assets?: string;
  music?: string;
  narrations?: { text: string; effect?: string }[];
  conversation?: ({ speaker: string; text: string; effect?: string } | { narrator: string; effect?: string })[];
  effects?: string;
  skillCheck?: { stat: string; dc: number; roll: number; mod: number; total: number; success: boolean; desc: string };
  diceRoll?: { notation: string; roll?: number; description: string };
  choices?: { id: string; text: string }[];
  showFreeText?: boolean;
  itemPresentation?: { name: string; description: string };
  cgPresentation?: { emotion: string; description: string };
  monologue?: { speaker?: string; text: string };
  investigation?: { hotspots: { id: string; label: string }[] };
  loreEntry?: { title: string; category: string; content: string };
  cutIn?: { speaker: string; text: string; style: string };
  flashback?: { text: string; filter: string };
  crossExam?: { speaker: string; statement: string };
  timeLimit?: { seconds: number; text: string; consequence: string };
  nodeComplete?: { locationId: string; isGameComplete: boolean };
}

type Phase = 'init' | 'thinking' | 'choice' | 'dice' | 'freetext' | 'gameover' | 'error';

interface SessionSetup {
  vnPackage: VNPackage;
  sessionId: string;
  packageId: string;
  isResuming: boolean;
  existingSummary: string;
  startingLocationId: string;
  existingSession: any;
}

// ─── Frame Parsing ──────────────────────────────────────────────────────────

let frameCounter = 0;

function parseFrame(toolInput: any, toolOutput: any): RenderedFrame {
  const frame = toolOutput?.frame ?? {};
  const type = frame.type || toolInput?.type || 'unknown';

  const panels = frame.panels ?? toolInput?.panels ?? [];
  const assetList = Array.isArray(panels)
    ? panels.map((p: any) => p.characterAsset || p.backgroundAsset || '').filter(Boolean).join(', ')
    : undefined;

  const audio = frame.audio ?? toolInput?.audio;
  const effectsArr = frame.effects ?? toolInput?.effects ?? [];

  // Narrations
  const rawNarrations = frame.narrations ?? toolInput?.narrations;
  const rawNarration = frame.narration ?? toolInput?.narration;
  let narrations: RenderedFrame['narrations'];
  if (Array.isArray(rawNarrations) && rawNarrations.length > 0) {
    narrations = rawNarrations.map((n: any) => ({ text: n.text, effect: n.effect?.type }));
  } else if (rawNarration?.text) {
    narrations = [{ text: rawNarration.text }];
  }

  // Conversation
  const rawConvo = frame.conversation ?? toolInput?.conversation;
  const rawDialogue = frame.dialogue ?? toolInput?.dialogue;
  let conversation: RenderedFrame['conversation'];
  if (Array.isArray(rawConvo) && rawConvo.length > 0) {
    conversation = rawConvo.map((l: any) => {
      if ('narrator' in l) return { narrator: l.narrator, effect: l.effect?.type };
      return { speaker: l.speaker, text: l.text, effect: l.effect?.type };
    });
  } else if (rawDialogue?.text) {
    conversation = [{ speaker: rawDialogue.speaker || 'Character', text: rawDialogue.text }];
  }

  // Choices
  const rawChoices = frame.choices ?? toolInput?.choices;
  const choices = type === 'choice' && Array.isArray(rawChoices)
    ? rawChoices.map((c: any) => ({ id: c.id, text: c.text }))
    : undefined;

  // Dice
  const rawDice = frame.diceRoll ?? toolInput?.diceRoll;
  const diceRoll = rawDice
    ? { notation: rawDice.diceNotation ?? '1d20', roll: rawDice.roll, description: rawDice.description ?? '' }
    : undefined;

  // Skill check
  const rawSC = frame.skillCheck ?? toolInput?.skillCheck;
  const skillCheck = rawSC ? {
    stat: rawSC.stat, dc: rawSC.difficulty, roll: rawSC.roll,
    mod: rawSC.modifier ?? 0, total: rawSC.total, success: rawSC.succeeded, desc: rawSC.description,
  } : undefined;

  return {
    id: `frame-${++frameCounter}`,
    index: frameCounter,
    type,
    assets: assetList || undefined,
    music: audio?.musicAsset ? `${audio.musicAsset}${audio.fadeIn ? ' (fade-in)' : ''}` : undefined,
    narrations,
    conversation,
    effects: Array.isArray(effectsArr) && effectsArr.length ? effectsArr.map((e: any) => e.type).join(', ') : undefined,
    skillCheck,
    diceRoll,
    choices,
    showFreeText: frame.showFreeTextInput ?? toolInput?.showFreeTextInput ?? false,
    itemPresentation: (frame.itemPresentation ?? toolInput?.itemPresentation)
      ? { name: (frame.itemPresentation ?? toolInput.itemPresentation).itemName, description: (frame.itemPresentation ?? toolInput.itemPresentation).description }
      : undefined,
    cgPresentation: (frame.cgPresentation ?? toolInput?.cgPresentation)
      ? { emotion: (frame.cgPresentation ?? toolInput.cgPresentation).emotion || 'neutral', description: (frame.cgPresentation ?? toolInput.cgPresentation).description }
      : undefined,
    monologue: (frame.monologue ?? toolInput?.monologue)
      ? { speaker: (frame.monologue ?? toolInput.monologue).speaker, text: (frame.monologue ?? toolInput.monologue).text }
      : undefined,
    investigation: (frame.investigationData ?? toolInput?.investigationData)
      ? { hotspots: (frame.investigationData ?? toolInput.investigationData).hotspots ?? [] }
      : undefined,
    loreEntry: (frame.loreEntry ?? toolInput?.loreEntry) ?? undefined,
    cutIn: (frame.cutIn ?? toolInput?.cutIn) ?? undefined,
    flashback: (frame.flashback ?? toolInput?.flashback)
      ? { text: (frame.flashback ?? toolInput.flashback).text, filter: (frame.flashback ?? toolInput.flashback).filter || 'sepia' }
      : undefined,
    crossExam: (frame.crossExamination ?? toolInput?.crossExamination)
      ? { speaker: (frame.crossExamination ?? toolInput.crossExamination).speaker, statement: (frame.crossExamination ?? toolInput.crossExamination).statement }
      : undefined,
    timeLimit: (frame.timeLimit ?? toolInput?.timeLimit)
      ? { seconds: (frame.timeLimit ?? toolInput.timeLimit).seconds, text: (frame.timeLimit ?? toolInput.timeLimit).text, consequence: (frame.timeLimit ?? toolInput.timeLimit).failureConsequence }
      : undefined,
  };
}

// ─── Components ─────────────────────────────────────────────────────────────

function ThinkingBar() {
  return (
    <Box>
      <Text color="cyan"><Spinner type="dots" /></Text>
      <Text color="gray"> DM is weaving the story...</Text>
    </Box>
  );
}

function FrameView({ frame }: { frame: RenderedFrame }) {
  const borderColor = frame.type === 'choice' ? 'yellow'
    : frame.type === 'dice-roll' ? 'magenta'
    : frame.type === 'skill-check' ? 'blue'
    : frame.type === 'transition' ? 'gray'
    : 'white';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} marginBottom={0}>
      <Text bold dimColor>Frame {frame.index}: {frame.type}</Text>

      {frame.assets && <Text color="gray">  {frame.assets}</Text>}
      {frame.music && <Text color="gray">  {frame.music}</Text>}

      {frame.narrations?.map((n, i) => (
        <Text key={i} wrap="wrap">
          {'  '}{n.text}{n.effect ? <Text color="yellow"> [{n.effect}]</Text> : ''}
        </Text>
      ))}

      {frame.conversation?.map((line, i) => (
        'narrator' in line
          ? <Text key={i} italic wrap="wrap">{'  '}{line.narrator}{line.effect ? <Text color="yellow"> [{line.effect}]</Text> : ''}</Text>
          : <Text key={i} wrap="wrap">{'  '}<Text bold color="cyan">{(line as any).speaker}:</Text> {(line as any).text}{line.effect ? <Text color="yellow"> [{line.effect}]</Text> : ''}</Text>
      ))}

      {frame.effects && <Text color="yellow">  Effects: {frame.effects}</Text>}

      {frame.skillCheck && (
        <Text color={frame.skillCheck.success ? 'green' : 'red'}>
          {'  '}{frame.skillCheck.stat} DC{frame.skillCheck.dc}: {frame.skillCheck.roll}+{frame.skillCheck.mod}={frame.skillCheck.total} {frame.skillCheck.success ? 'SUCCESS' : 'FAILURE'}
        </Text>
      )}

      {frame.diceRoll && (
        <Text color="magenta">{'  '}{frame.diceRoll.notation} — {frame.diceRoll.description}</Text>
      )}

      {frame.itemPresentation && (
        <Box flexDirection="column">
          <Text color="green" bold>{'  '}ITEM ACQUIRED: {frame.itemPresentation.name}</Text>
          {frame.itemPresentation.description && <Text color="green">{'    '}{frame.itemPresentation.description}</Text>}
        </Box>
      )}

      {frame.cgPresentation && (
        <Box flexDirection="column">
          <Text color="magenta" bold>{'  '}EVENT CG [{frame.cgPresentation.emotion}]</Text>
          {frame.cgPresentation.description && <Text>{'    '}{frame.cgPresentation.description}</Text>}
        </Box>
      )}

      {frame.monologue && (
        <Text italic>{'  '}*** {frame.monologue.speaker ? `${frame.monologue.speaker}: ` : ''}{frame.monologue.text} ***</Text>
      )}

      {frame.investigation && (
        <Box flexDirection="column">
          <Text bold>{'  '}INVESTIGATION SCENE</Text>
          {frame.investigation.hotspots.map((h, i) => (
            <Text key={i}>{'    '}- {h.label}</Text>
          ))}
        </Box>
      )}

      {frame.loreEntry && (
        <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginX={1}>
          <Text bold color="blue">LORE: {frame.loreEntry.title} [{frame.loreEntry.category}]</Text>
          <Text wrap="wrap">{frame.loreEntry.content}</Text>
        </Box>
      )}

      {frame.cutIn && (
        <Text bold color={frame.cutIn.style === 'shout' ? 'red' : frame.cutIn.style === 'critical' ? 'yellow' : 'gray'}>
          {'  '}[CUT-IN: {frame.cutIn.speaker}] {frame.cutIn.text}
        </Text>
      )}

      {frame.flashback && (
        <Text color="gray" italic>{'  '}[FLASHBACK: {frame.flashback.filter}] {frame.flashback.text}</Text>
      )}

      {frame.crossExam && (
        <Box flexDirection="column">
          <Text bold>{'  '}CROSS-EXAMINATION: {frame.crossExam.speaker}</Text>
          <Text italic>{'    '}"{frame.crossExam.statement}"</Text>
        </Box>
      )}

      {frame.timeLimit && (
        <Text color="red" bold>{'  '}WARNING: {frame.timeLimit.seconds}s — {frame.timeLimit.text}</Text>
      )}

      {frame.nodeComplete && (
        <Text color="green" bold>
          {'  '}Location Complete: {frame.nodeComplete.locationId}
          {frame.nodeComplete.isGameComplete ? ' — GAME OVER' : ''}
        </Text>
      )}
    </Box>
  );
}

function ChoiceInputArea({ choices, showFreeText, onSubmit }: {
  choices: { id: string; text: string }[];
  showFreeText: boolean;
  onSubmit: (text: string) => void;
}) {
  const [mode, setMode] = useState<'select' | 'text'>(choices.length > 0 ? 'select' : 'text');
  const [textValue, setTextValue] = useState('');

  useInput((_ch, key) => {
    if (key.tab && showFreeText && choices.length > 0) {
      setMode(m => m === 'select' ? 'text' : 'select');
    }
  });

  if (mode === 'select' && choices.length > 0) {
    const items = choices.map((c) => ({ label: c.text, value: c.id }));
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">What do you do?</Text>
        <SelectInput
          items={items}
          onSelect={(item) => {
            const chosen = choices.find(c => c.id === item.value);
            onSubmit(`Player chooses: ${chosen?.text ?? item.label}`);
          }}
        />
        {showFreeText && <Text dimColor>  [Tab] Type a custom action</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">What do you do?</Text>
      <Box>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={textValue}
          onChange={setTextValue}
          onSubmit={(val) => {
            if (val.trim()) onSubmit(`Player takes action: ${val}`);
          }}
        />
      </Box>
      {choices.length > 0 && <Text dimColor>  [Tab] Back to choices</Text>}
    </Box>
  );
}

function FreeTextInputArea({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">What do you do?</Text>
      <Box>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(val) => {
            if (val.trim()) onSubmit(`Player: ${val}`);
          }}
        />
      </Box>
    </Box>
  );
}

function DicePromptArea({ notation, description, onRoll }: {
  notation: string;
  description: string;
  onRoll: (total: number) => void;
}) {
  const [rolled, setRolled] = useState(false);
  const [result, setResult] = useState(0);

  useInput((_ch, key) => {
    if (key.return && !rolled) {
      const match = notation.match(/(\d+)d(\d+)/);
      const [count, sides] = match ? [+match[1], +match[2]] : [1, 20];
      let total = 0;
      for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
      setResult(total);
      setRolled(true);
      setTimeout(() => onRoll(total), 400);
    }
  });

  return (
    <Box flexDirection="column">
      <Text>  <Text bold color="magenta">{notation}</Text> — {description}</Text>
      {!rolled
        ? <Text color="cyan">  Press Enter to roll...</Text>
        : <Text color="green" bold>  You rolled: {result}</Text>
      }
    </Box>
  );
}

function GameOverBanner() {
  const { exit } = useApp();

  useInput(() => {
    exit();
  });

  return (
    <Box flexDirection="column" paddingY={1} alignItems="center">
      <Text bold color="yellow">GAME OVER</Text>
      <Text dimColor>Press any key to exit</Text>
    </Box>
  );
}

function ResumeRecap({ session, locationId, summary }: {
  session: any;
  locationId: string;
  summary: string;
}) {
  const flags = JSON.parse(session.flagsJson || '{}');
  const stats = JSON.parse(session.playerStatsJson || '{}');
  const completed: string[] = JSON.parse(session.completedLocations || '[]');

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="blue" paddingX={1} marginBottom={1}>
      <Text bold color="blue">Resuming session</Text>
      <Text>  Location: {locationId}</Text>
      <Text>  Act: {session.currentActId}</Text>
      {completed.length > 0 && <Text>  Completed: {completed.join(', ')}</Text>}
      {Object.keys(flags).length > 0 && <Text>  Flags: {JSON.stringify(flags)}</Text>}
      {stats.hp != null && <Text>  Stats: HP {stats.hp}/{stats.maxHp}, Level {stats.level ?? 1}</Text>}
      {summary && <Text wrap="wrap" dimColor>  {summary}</Text>}
    </Box>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

function App({ setup }: { setup: SessionSetup }) {
  const { vnPackage, sessionId, isResuming, existingSummary, startingLocationId, existingSession } = setup;
  const { exit } = useApp();

  const [renderedFrames, setRenderedFrames] = useState<RenderedFrame[]>([]);
  const [phase, setPhase] = useState<Phase>('init');
  const [choices, setChoices] = useState<{ id: string; text: string }[]>([]);
  const [showFreeText, setShowFreeText] = useState(false);
  const [diceNotation, setDiceNotation] = useState('2d6');
  const [diceDescription, setDiceDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Mutable refs for the game loop (avoid stale closures)
  const messagesRef = useRef<any[]>([]);
  const agentRef = useRef(createStorytellerAgent(vnPackage, sessionId));
  const activeRef = useRef(true);
  const runningRef = useRef(false);

  const runTurn = useCallback(async () => {
    if (!activeRef.current) return;
    if (runningRef.current) {
      console.log('[play] runTurn skipped — already running');
      return;
    }
    runningRef.current = true;
    console.log(`[play] runTurn started (${messagesRef.current.length} messages)`);

    const preTurnState = db.select({ currentLocationId: plotStates.currentLocationId, storySummary: plotStates.storySummary })
      .from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    let compressedMessages = await compressContext(
      messagesRef.current, sessionId, preTurnState?.storySummary || ''
    ) as any[];

    const { provider, modelId } = getActiveModelInfo('storyteller');
    const { onStepFinish: traceOnStepFinish, finishTrace } = startLLMTrace({
      sessionId,
      pipeline: 'vn-tell-chat', agentId: 'storyteller-chat-agent',
      modelProvider: provider, modelId,
      tags: ['agent', 'storyteller', 'tui'], source: 'play',
    }, { pipeline: 'vn-tell-chat', sessionId });

    let lastFrameType = '';
    let lastChoices: { id: string; text: string }[] = [];
    let lastShowFreeText = false;
    let lastDiceNotation = '2d6';
    let lastDiceDescription = '';
    let gameComplete = false;

    // Outer loop: turn-level frame retry (nudges model if entire turn produces 0 frames)
    // Inner loop: dice continuation (re-runs agent after player rolls dice)
    let retryCount = 0;
    const MAX_RETRIES = 2;
    let turnDone = false;
    try {
      while (!turnDone && activeRef.current) {
        let totalFrames = 0;

        // ── Inner: dice-continuation loop ──────────────────────────────────
        let diceLoop = true;
        while (diceLoop && activeRef.current) {
          lastFrameType = '';
          lastChoices = [];
          lastShowFreeText = false;

          const result = await agentRef.current.stream({
            messages: compressedMessages,
            onStepFinish: traceOnStepFinish,
            timeout: 120_000,
          });

          for await (const event of result.fullStream) {
            if (event.type === 'tool-result') {
              const toolName = event.toolName as string;
              const toolInput = (event as any).input;
              const toolOutput = event.output;

              if (toolName === 'frameBuilderTool') {
                const out = toolOutput as any;
                if (out?.ok) {
                  totalFrames++;
                  const parsed = parseFrame(toolInput, toolOutput);
                  lastFrameType = parsed.type;
                  if (parsed.choices?.length) lastChoices = parsed.choices;
                  if (parsed.showFreeText) lastShowFreeText = true;
                  if (parsed.diceRoll) {
                    lastDiceNotation = parsed.diceRoll.notation;
                    lastDiceDescription = parsed.diceRoll.description;
                  }
                  setRenderedFrames(prev => [...prev, parsed]);
                }
                // Skip frames where ok=false (empty content rejected by tool)
              } else if (toolName === 'nodeCompleteTool') {
                const out = toolOutput as any;
                setRenderedFrames(prev => [...prev, {
                  id: `nc-${Date.now()}`, index: ++frameCounter, type: 'node-complete',
                  nodeComplete: { locationId: out?.completedLocationId ?? '', isGameComplete: out?.isGameComplete ?? false },
                }]);
                if (out?.isGameComplete) gameComplete = true;
              }
            }
          }

          // Append response messages to history
          const resp = await result.response;
          const appendRaw = resp.messages as any[];
          messagesRef.current = sanitizeHistory([...messagesRef.current, ...appendRaw]);

          if (gameComplete) {
            setPhase('gameover');
            finishTrace('success');
            runningRef.current = false;
            return;
          } else if (lastFrameType === 'dice-roll') {
            // Wait for dice input — break out and let React handle it
            setDiceNotation(lastDiceNotation);
            setDiceDescription(lastDiceDescription);
            setPhase('dice');
            finishTrace('success');
            runningRef.current = false;
            return; // DicePromptArea will call handleDiceResult
          } else {
            diceLoop = false;
          }
        }

        // ── Turn complete — check if any frames were produced ─────────────
        if (totalFrames === 0 && retryCount < MAX_RETRIES) {
          retryCount++;
          console.log(`[play] No frames after turn (retry ${retryCount}/${MAX_RETRIES})`);
          messagesRef.current.push({
            role: 'user',
            content: [{ type: 'text', text: '[system: Continue the scene. Call frameBuilderTool with conversation[] or narrations[] to advance the narrative.]' }],
          });
          compressedMessages = await compressContext(
            messagesRef.current, sessionId, preTurnState?.storySummary || ''
          ) as any[];
          // turnDone stays false → outer loop retries
        } else {
          turnDone = true;
        }
      }

      finishTrace('success');

      // Check for location transitions to trigger summarization
      if (preTurnState) {
        const postTurnState = db.select({ currentLocationId: plotStates.currentLocationId })
          .from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
        if (postTurnState && postTurnState.currentLocationId !== preTurnState.currentLocationId) {
          await summarizeNodeInBackground(sessionId, messagesRef.current as any[], preTurnState.storySummary);
        }
      }

      // Determine input phase
      console.log(`[play] Turn done. lastFrameType=${lastFrameType}, choices=${lastChoices.length}, freeText=${lastShowFreeText}`);
      if (lastChoices.length > 0 || lastShowFreeText) {
        setChoices(lastChoices);
        setShowFreeText(lastShowFreeText);
        setPhase('choice');
      } else {
        setPhase('freetext');
      }

    } catch (e: any) {
      finishTrace('error', e);
      setErrorMsg(String(e?.message ?? e));
      setPhase('error');
    } finally {
      runningRef.current = false;
    }
  }, [sessionId]);

  // Handle dice result — continue the agent loop with the dice result
  const handleDiceResult = useCallback((total: number) => {
    console.log(`[play] Dice result: ${total}`);
    messagesRef.current.push({ role: 'user', content: [{ type: 'text', text: `[dice-result] ${total}` }] });
    setPhase('thinking');
    runTurn();
  }, [runTurn]);

  // Handle player choice/text submission
  const handlePlayerInput = useCallback((text: string) => {
    if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
      activeRef.current = false;
      exit();
      return;
    }
    console.log(`[play] Player input: ${text}`);
    messagesRef.current.push({ role: 'user', content: [{ type: 'text', text }] });
    // Set phase synchronously so the choice UI unmounts immediately
    setPhase('thinking');
    runTurn();
  }, [runTurn, exit]);

  // Build initial messages and kick off first turn
  useEffect(() => {
    if (isResuming && existingSession) {
      const parts = [
        `[system: resuming session]`,
        `Current location: ${startingLocationId}`,
        `Current act: ${existingSession.currentActId}`,
      ];
      if (existingSummary) parts.push(`Story so far: ${existingSummary}`);
      const completed: string[] = JSON.parse(existingSession.completedLocations || '[]');
      if (completed.length) parts.push(`Completed locations: ${completed.join(', ')}`);
      const flags = JSON.parse(existingSession.flagsJson || '{}');
      if (Object.keys(flags).length) parts.push(`Active flags: ${JSON.stringify(flags)}`);
      const stats = JSON.parse(existingSession.playerStatsJson || '{}');
      if (stats.hp != null) parts.push(`Player: HP ${stats.hp}/${stats.maxHp}, Level ${stats.level ?? 1}`);
      messagesRef.current = [{ role: 'user', content: [{ type: 'text', text: parts.join('\n') }] }];
    } else {
      messagesRef.current = [{ role: 'user', content: [{ type: 'text', text: '[scene start]' }] }];
    }
    setPhase('thinking');
    runTurn();
  }, []);

  // Ctrl+C to quit
  useInput((_ch, key) => {
    if (key.escape) {
      activeRef.current = false;
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      {/* Title bar */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={0}>
        <Text bold color="cyan">{vnPackage.title}</Text>
        <Text> — </Text>
        <Text dimColor>{sessionId.slice(0, 8)}</Text>
      </Box>

      {/* Resume recap (shown once) */}
      {isResuming && existingSession && renderedFrames.length === 0 && (
        <ResumeRecap session={existingSession} locationId={startingLocationId} summary={existingSummary} />
      )}

      {/* Completed frames — rendered permanently, scroll up */}
      <Static items={renderedFrames}>
        {(frame) => <FrameView key={frame.id} frame={frame} />}
      </Static>

      {/* Active UI */}
      {phase === 'thinking' && <ThinkingBar />}

      {phase === 'choice' && (
        <ChoiceInputArea
          choices={choices}
          showFreeText={showFreeText}
          onSubmit={handlePlayerInput}
        />
      )}

      {phase === 'freetext' && (
        <FreeTextInputArea onSubmit={handlePlayerInput} />
      )}

      {phase === 'dice' && (
        <DicePromptArea
          notation={diceNotation}
          description={diceDescription}
          onRoll={handleDiceResult}
        />
      )}

      {phase === 'gameover' && <GameOverBanner />}

      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red" bold>Error: {errorMsg}</Text>
          <Text dimColor>Press Esc to exit</Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function main() {
  const cliArgs = process.argv.slice(2);
  const argId = cliArgs[0] || 'e527a879-ef93-41b3-958c-b7540ae0bc47';

  let packageId = argId;
  let sessionId = randomUUID();
  let isResuming = false;
  let existingSummary = '';
  let startingLocationId = '';
  let existingSession: any = null;

  // Check if arg is a sessionId
  existingSession = db.select().from(plotStates).where(eq(plotStates.sessionId, argId)).get();
  if (existingSession) {
    sessionId = argId;
    packageId = existingSession.packageId;
    isResuming = true;
    existingSummary = existingSession.storySummary || '';
    startingLocationId = existingSession.currentLocationId || '';
  }

  // Fetch package
  const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
  if (!pkgRow) {
    console.error(`Package ${packageId} not found in DB.`);
    process.exit(1);
  }
  const vnPackage = JSON.parse(pkgRow.metaJson) as VNPackage;

  // Initialize plot state (if new)
  if (!isResuming) {
    const startingActId = vnPackage.plot.acts[0]?.id;
    startingLocationId = vnPackage.plot.acts[0]?.sandboxLocations?.[0]?.id || '';
    if (!startingActId || !startingLocationId) {
      console.error(`No starting act or node found in package.`);
      process.exit(1);
    }
    db.insert(plotStates).values({
      sessionId, packageId,
      currentActId: startingActId,
      currentLocationId: startingLocationId,
      currentBeat: 0, offPathTurns: 0,
      flagsJson: '{}', completedLocations: '[]', playerStatsJson: '{}',
      updatedAt: new Date().toISOString(),
    } as any).run();
  }

  const setup: SessionSetup = {
    vnPackage, sessionId, packageId, isResuming,
    existingSummary, startingLocationId, existingSession,
  };

  const { waitUntilExit } = render(<App setup={setup} />);
  await waitUntilExit();
}

main();
