export type StatusEffect = {
  id: string;
  name: string;
  type: 'buff' | 'debuff' | 'neutral';
  description: string;
  turnsRemaining?: number;
  icon?: string;
};

export type Item = {
  id: string;
  name: string;
  description: string;
  icon: string;
  quantity: number;
  equipped?: boolean;
  effect?: string;
};

export type PlayerStats = {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  attributes: {
    strength: number;
    dexterity: number;
    intelligence: number;
    luck: number;
    charisma: number;
  };
  skills: string[];
  statusEffects: StatusEffect[];
  items: Item[];
};

export function defaultPlayerStats(name: string): PlayerStats {
  return {
    name,
    level: 1,
    hp: 20,
    maxHp: 20,
    attributes: { strength: 8, dexterity: 8, intelligence: 8, luck: 8, charisma: 8 },
    skills: [],
    statusEffects: [],
    items: [],
  };
}
