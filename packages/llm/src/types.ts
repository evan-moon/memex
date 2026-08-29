export type LlmModel = 'sonnet' | 'opus' | 'haiku';

export type LlmRequest = {
  prompt: string;
  model: LlmModel;
  signal?: AbortSignal;
  timeoutMs?: number;
};

// What went wrong, at the granularity someone can act on. `refused` is the
// catch-all: the call reached Anthropic and came back no, for a reason this
// does not recognise, and the message is the only thing left to show.
export type LlmFailureCode =
  | 'not-installed'
  | 'logged-out'
  | 'quota'
  | 'model-refused'
  | 'refused'
  | 'timeout'
  | 'cancelled';

export type LlmFailure = {
  error: string;
  code?: LlmFailureCode;
};

export type LlmAnswer = {
  text: string;
  durationMs: number;
};

export type LlmResult = LlmAnswer | LlmFailure;

export const isLlmFailure = (result: LlmResult): result is LlmFailure => 'error' in result;

export type LlmProvider = (request: LlmRequest) => Promise<LlmResult>;
