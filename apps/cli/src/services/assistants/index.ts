import { install } from './installer.ts';
import { assistantSpecs } from './specs.ts';
import type { AssistantId, LoginMethod } from './types.ts';

export const readAssistant = (id: AssistantId, home: string, pathEnv: string) =>
  assistantSpecs[id].read(home, pathEnv);

export const installAssistant = (id: AssistantId) => {
  const spec = assistantSpecs[id];
  return install(spec.installerUrl, spec.installerArgs);
};

export const loginAttemptFor = (id: AssistantId, method: LoginMethod, binary: string) => {
  const args = assistantSpecs[id].loginArgs[method];
  return args === undefined ? null : { binary, args };
};

export {
  fetchInstaller,
  type InstallRun,
  install,
  runInstaller,
  type ScriptFetch,
} from './installer.ts';
export {
  createLoginRunner,
  type LoginAttempt,
  type LoginRunner,
  type LoginState,
} from './login.ts';
export { ASSISTANT_IDS, assistantSpecs, isAssistantId, isLoginMethod } from './specs.ts';
export type { AssistantId, AssistantState, LoginMethod } from './types.ts';
