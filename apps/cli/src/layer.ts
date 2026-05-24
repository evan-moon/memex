import pc from 'picocolors';
import type { NoteLayer } from '@memex/db';

const BADGE: Record<NoteLayer, string> = {
  past: '[과거]',
  state: '[현재]',
  rule: '[규칙]',
};

const COLOR: Record<NoteLayer, (s: string) => string> = {
  past: pc.gray,
  state: pc.cyan,
  rule: pc.yellow,
};

export const layerBadge = (layer: NoteLayer): string => COLOR[layer](BADGE[layer]);

export const layerColor = (layer: NoteLayer): ((s: string) => string) => COLOR[layer];

export const LAYER_ORDER: ReadonlyArray<NoteLayer> = ['past', 'state', 'rule'];
