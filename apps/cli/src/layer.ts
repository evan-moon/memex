import type { NoteLayer } from '@memex/db';
import pc from 'picocolors';

const BADGE: Record<NoteLayer, string> = {
  past: '[past]',
  state: '[state]',
  rule: '[rule]',
  external: '[external]',
};

const COLOR: Record<NoteLayer, (s: string) => string> = {
  past: pc.gray,
  state: pc.cyan,
  rule: pc.yellow,
  external: pc.dim,
};

export const layerBadge = (layer: NoteLayer): string => COLOR[layer](BADGE[layer]);

export const layerColor = (layer: NoteLayer): ((s: string) => string) => COLOR[layer];

// `memex layer` walks what memex owns and can move a note between. An external
// note is in none of those: the layer is read off the path, not chosen.
export const LAYER_ORDER: ReadonlyArray<NoteLayer> = ['past', 'state', 'rule'];
