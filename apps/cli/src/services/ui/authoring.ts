import type { LlmChoice } from '@memex/llm';
import { buildContext, type ContextRequest } from '../chat/context.ts';
import type { ChatFailure } from '../chat/errors.ts';
import { type ChatDeps, planTurn, type TurnRequest } from '../chat/turn.ts';
import { type AuthoringDraft, authoringDraftFromMarkdown } from './authoring-draft.ts';

export type { AuthoringDraft } from './authoring-draft.ts';

export type AuthoringResult =
  | { kind: 'draft'; draft: AuthoringDraft }
  | { kind: 'failed'; failure: ChatFailure; detail: string };

export type AuthoringFailureCode =
  | 'draft-provider-missing'
  | 'draft-logged-out'
  | 'draft-quota'
  | 'draft-model-refused'
  | 'draft-failed'
  | 'draft-timeout'
  | 'draft-cancelled'
  | 'draft-unreadable';

const AUTHORING_CODE_BY_FAILURE: Record<ChatFailure, AuthoringFailureCode> = {
  'not-installed': 'draft-provider-missing',
  'logged-out': 'draft-logged-out',
  quota: 'draft-quota',
  'model-refused': 'draft-model-refused',
  refused: 'draft-failed',
  timeout: 'draft-timeout',
  cancelled: 'draft-cancelled',
  'unreadable-plan': 'draft-unreadable',
};

export const authoringFailureCode = (failure: ChatFailure) => AUTHORING_CODE_BY_FAILURE[failure];

const requestFor = (brief: string): string =>
  `새 문서 초안을 작성해줘. 제목과 본문을 포함한 new-note 제안으로 답하고 실제 저장은 하지 마. 요구사항: ${brief}`;

export const draftDocument = async (
  deps: ChatDeps,
  brief: string,
  choice: LlmChoice,
  context?: ContextRequest,
  activity?: Pick<TurnRequest, 'signal' | 'onStep'>,
): Promise<AuthoringResult> => {
  const turn = await planTurn(deps, {
    message: requestFor(brief),
    choice,
    context: context === undefined ? undefined : buildContext(deps.client, context),
    ...activity,
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
  if (turn.kind === 'failed') {
    const recovered =
      turn.failure === 'unreadable-plan' && turn.response !== undefined
        ? authoringDraftFromMarkdown(turn.response)
        : null;
    if (recovered !== null) return { kind: 'draft', draft: recovered };
    return { kind: 'failed', failure: turn.failure, detail: turn.detail };
  }
  return {
    kind: 'failed',
    failure: 'unreadable-plan',
    detail: 'AI did not return a document draft.',
  };
};
