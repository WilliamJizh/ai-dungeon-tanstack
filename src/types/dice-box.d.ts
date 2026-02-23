declare module '@3d-dice/dice-box' {
  interface DiceBoxConfig {
    container?: string;
    assetPath?: string;
    id?: string;
    gravity?: number;
    mass?: number;
    friction?: number;
    restitution?: number;
    angularDamping?: number;
    linearDamping?: number;
    spinForce?: number;
    throwForce?: number;
    startingHeight?: number;
    settleTimeout?: number;
    offscreen?: boolean;
    scale?: number;
    theme?: string;
    themeColor?: string;
    light?: { enabled?: boolean };
    onRollComplete?: (results: DieResult[]) => void;
    onDieComplete?: (result: DieResult) => void;
    onBeforeRoll?: (results: DieResult[]) => void;
    onRemoveComplete?: (results: DieResult[]) => void;
    onThemeConfigLoaded?: (data: unknown) => void;
    onThemeLoaded?: (data: unknown) => void;
  }

  export interface DieResult {
    groupId: string;
    rollId: string;
    sides: number;
    theme: string;
    value: number;
  }

  class DiceBox {
    constructor(config: DiceBoxConfig);
    init(): Promise<void>;
    roll(notation: string, options?: { theme?: string; themeColor?: string }): Promise<DieResult[]>;
    add(notation: string, options?: { theme?: string; themeColor?: string }): Promise<DieResult[]>;
    clear(): DiceBox;
    hide(): DiceBox;
    show(): DiceBox;
    updateConfig(config: Partial<DiceBoxConfig>): void;
    onRollComplete: (results: DieResult[]) => void;
    onDieComplete: (result: DieResult) => void;
  }

  export default DiceBox;
}
