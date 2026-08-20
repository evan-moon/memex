import type { NoteLayer } from '@memex/db';
import pc from 'picocolors';

const BADGE: Record<NoteLayer, string> = {
  past: '[past]',
  state: '[state]',
  rule: '[rule]',
};

const COLOR: Record<NoteLayer, (s: string) => string> = {
  past: pc.gray,
  state: pc.cyan,
  rule: pc.yellow,
};

export const layerBadge = (layer: NoteLayer): string => COLOR[layer](BADGE[layer]);

export const layerColor = (layer: NoteLayer): ((s: string) => string) => COLOR[layer];

export const LAYER_ORDER: ReadonlyArray<NoteLayer> = ['past', 'state', 'rule'];
