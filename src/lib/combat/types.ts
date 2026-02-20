export type TokenType = 'player' | 'enemy' | 'ally' | 'objective' | 'npc';
export type TerrainType = 'blocked' | 'difficult' | 'hazard' | 'cover';
export type AIPattern = 'aggressive' | 'defensive' | 'patrol' | 'guard-objective';
export type CombatPhase = 'player' | 'enemy' | 'cutscene';
export type CombatResult = 'victory' | 'defeat' | 'escape';

export interface CombatToken {
  id: string;
  type: TokenType;
  label: string;
  icon: string;
  portraitAsset?: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  moveRange: number;
  attackRange: number;
  aiPattern?: AIPattern;
  patrolPath?: Array<{ col: number; row: number }>;
  hasActed: boolean;
  hasMoved: boolean;
  statusEffects: string[];
}

export interface TerrainCell {
  col: number;
  row: number;
  type: TerrainType;
  icon?: string;
}

export interface CombatState {
  round: number;
  phase: CombatPhase;
  turnOrder: string[];
  activeTokenId: string;
  log: string[];
  isComplete: boolean;
  result?: CombatResult;
}

export interface CombatRules {
  playerMoveRange: number;
  playerAttackRange: number;
  showGrid: boolean;
}

export interface TacticalMapData {
  mapImageUrl: string;
  gridCols: number;
  gridRows: number;
  tokens: CombatToken[];
  terrain: TerrainCell[];
  combat: CombatState;
  rules: CombatRules;
}

export type CombatAction =
  | { type: 'MOVE'; tokenId: string; col: number; row: number }
  | { type: 'ATTACK'; attackerId: string; targetId: string }
  | { type: 'END_TURN' }
  | { type: 'ENEMY_TURN' }
  | { type: 'APPLY_EXTERNAL'; data: TacticalMapData };
