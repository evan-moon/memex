const exitCode = (code) => (typeof code === 'number' ? code : 0);

const isBrokenPipe = (error) => error instanceof Error && 'code' in error && error.code === 'EPIPE';

export const createDevProcesses = (exit) => {
  const children = new Set();
  let stopping = false;

  const terminate = () => {
    for (const child of children) child.kill('SIGTERM');
  };

  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    terminate();
    exit(code);
  };

  const add = (child, options = {}) => {
    children.add(child);
    child.once('exit', (code) => {
      children.delete(child);
      if (options.endsSession || (code !== 0 && code !== null)) stop(exitCode(code));
    });
    return child;
  };

  const handleOutputError = (error) => {
    if (isBrokenPipe(error)) {
      stop(0);
      return;
    }
    throw error;
  };

  return { add, handleOutputError, stop, terminate };
};
