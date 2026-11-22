/**
 * A schedule operation that breaks a domain rule. The message is pt-BR, explains the
 * cause and is ready to show; the state is never changed when one is thrown.
 */
export class ScheduleRuleError extends Error {
  readonly code: ScheduleRuleCode;

  constructor(code: ScheduleRuleCode, message: string) {
    super(message);
    this.name = 'ScheduleRuleError';
    this.code = code;
  }
}

export type ScheduleRuleCode =
  | 'task-not-found'
  | 'hierarchy-cycle'
  | 'cannot-indent'
  | 'cannot-outdent'
  | 'cannot-move'
  | 'self-dependency'
  | 'dependency-cycle'
  | 'duplicate-dependency'
  | 'summary-dependency'
  | 'linked-task-cannot-be-summary'
  | 'invalid-predecessors'
  | 'invalid-field'
  | 'summary-derived'
  | 'limit-reached';
