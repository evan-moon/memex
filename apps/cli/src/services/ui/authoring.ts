import type { LlmChoice } from '@memex/llm';
import { buildContext, type ContextRequest } from '../chat/context.ts';
import { type ChatDeps, planTurn } from '../chat/turn.ts';

export type AuthoringDraft = {
  title: string;
  body: string;
  layer: 'past' | 'state';
};

export type AuthoringResult =
  | { kind: 'draft'; draft: AuthoringDraft }
  | { kind: 'failed'; detail: string };

const requestFor = (brief: string): string =>
  `새 문서 초안을 작성해줘. 제목과 본문을 포함한 new-note 제안으로 답하고 실제 저장은 하지 마. 요구사항: ${brief}`;

export const draftDocument = async (
  deps: ChatDeps,
  brief: string,
  choice: LlmChoice,
  context?: ContextRequest,
): Promise<AuthoringResult> => {
  const turn = await planTurn(deps, {
    message: requestFor(brief),
    choice,
    context: context === undefined ? undefined : buildContext(deps.client, context),
  });
  if (turn.kind === 'plan' && turn.plan.kind === 'new-note') {
    return {
      kind: 'draft',
      draft: {
        title: turn.plan.title,
        body: turn.plan.content,
        layer: turn.plan.layer,
      },
    };
  }
  if (turn.kind === 'failed') return { kind: 'failed', detail: turn.detail };
  return { kind: 'failed', detail: 'AI did not return a document draft.' };
};
