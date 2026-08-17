import type { OperatorAnswer } from './operator-answers'

export interface OperatorAnswerDashboardGroupDefinition {
  id: string
  label: string
  description: string
  answerIds: string[]
}

export interface OperatorAnswerDashboardGroup extends OperatorAnswerDashboardGroupDefinition {
  answers: OperatorAnswer[]
}

export const operatorAnswerDashboardGroups: OperatorAnswerDashboardGroupDefinition[] = [
  {
    id: 'priority',
    label: 'Priority',
    description: 'What deserves attention before anything else.',
    answerIds: ['attention-first', 'active-incidents', 'site-health'],
  },
  {
    id: 'live',
    label: 'Live state',
    description: 'The most useful current operating facts.',
    answerIds: ['controllers-online', 'solar-now', 'battery-voltage-now', 'charge-stage-now'],
  },
  {
    id: 'outlook',
    label: 'Today & outlook',
    description: 'What the local-history models say about the rest of today.',
    answerIds: ['solar-normal-now', 'projected-eod', 'ahead-behind', 'reach-float'],
  },
  {
    id: 'confidence',
    label: 'Evidence confidence',
    description: 'Whether the dashboard has enough trustworthy evidence to support its conclusions.',
    answerIds: ['metric-quality', 'evidence-depth', 'forecast-accuracy'],
  },
]

export function selectOperatorAnswerDashboardGroups(
  answers: OperatorAnswer[],
): OperatorAnswerDashboardGroup[] {
  const byId = new Map(answers.map((item) => [item.id, item]))
  return operatorAnswerDashboardGroups.map((group) => ({
    ...group,
    answers: group.answerIds.flatMap((id) => {
      const item = byId.get(id)
      return item ? [item] : []
    }),
  }))
}

export function dashboardAnswerIds(): string[] {
  return operatorAnswerDashboardGroups.flatMap((group) => group.answerIds)
}
