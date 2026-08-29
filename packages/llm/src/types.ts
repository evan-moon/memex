export type LlmModel = 'sonnet' | 'opus' | 'haiku';

export type LlmRequest = {
  prompt: string;
  model: LlmModel;
};

export type LlmFailure = {
  error: string;
  code?: 'not-installed';
};

export type LlmAnswer = {
  text: string;
  durationMs: number;
};

export type LlmResult = LlmAnswer | LlmFailure;

export const isLlmFailure = (result: LlmResult): result is LlmFailure => 'error' in result;

export type LlmProvider = (request: LlmRequest) => Promise<LlmResult>;
