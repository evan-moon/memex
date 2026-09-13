import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createDevProcesses } from '../scripts/dev-processes.mjs';

const createChild = () => {
  const child = new EventEmitter();
  const kill = vi.fn();
  return Object.assign(child, { kill });
};

describe('createDevProcesses', () => {
  it('stops every process when the app exits normally', () => {
    const exit = vi.fn();
    const processes = createDevProcesses(exit);
    const page = createChild();
    const app = createChild();

    processes.add(page);
    processes.add(app, { endsSession: true });
    app.emit('exit', 0);

    expect(page.kill).toHaveBeenCalledWith('SIGTERM');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('stops every process when its output pipe closes', () => {
    const exit = vi.fn();
    const processes = createDevProcesses(exit);
    const page = createChild();
    const app = createChild();

    processes.add(page);
    processes.add(app, { endsSession: true });
    processes.handleOutputError(Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));

    expect(page.kill).toHaveBeenCalledWith('SIGTERM');
    expect(app.kill).toHaveBeenCalledWith('SIGTERM');
    expect(exit).toHaveBeenCalledWith(0);
  });
});
