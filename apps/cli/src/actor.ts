import type { Actor } from '@memex/core';

// Being local is not being the person. The CLI is run by somebody at a terminal
// and it is also run by scripts, by CI, and by an agent that spawned a shell —
// and treating all of those as the vault owner would make every restriction in
// the app trivial to walk around.
//
// A terminal somebody is typing into has a TTY. Nothing else reliably does, so
// that is the line: attached to a terminal means a person asked for this.
export const actorOf = (stream: { isTTY?: boolean } = process.stdout): Actor =>
  stream.isTTY === true ? 'user' : 'agent';
