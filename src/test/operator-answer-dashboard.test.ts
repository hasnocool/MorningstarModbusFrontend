import { describe, expect, it } from 'vitest'
import {
  dashboardAnswerIds,
  operatorAnswerDashboardGroups,
  selectOperatorAnswerDashboardGroups,
} from '../operator-answer-dashboard-model'
import type { OperatorAnswer } from '../operator-answers'

function answer(id: string): OperatorAnswer {
  return {
    id,
    category: 'Now',
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    detail: 'Evidence-backed answer.',
    evidence: [],
    status: 'online',
    href: '/site/questions',
    actionLabel: 'Open evidence',
    keywords: [id],
  }
}

describe('Operator Answers dashboard organization', () => {
  it('keeps a compact unique high-signal subset of the full catalog', () => {
    const ids = dashboardAnswerIds()
    expect(operatorAnswerDashboardGroups).toHaveLength(4)
    expect(ids).toHaveLength(14)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('organizes answers into priority, live state, outlook, and evidence confidence', () => {
    const answers = dashboardAnswerIds().map(answer)
    const groups = selectOperatorAnswerDashboardGroups(answers)

    expect(groups.map((group) => group.id)).toEqual([
      'priority',
      'live',
      'outlook',
      'confidence',
    ])
    expect(groups.map((group) => group.answers.length)).toEqual([3, 4, 4, 3])
    expect(groups[0]?.answers[0]?.id).toBe('attention-first')
    expect(groups[2]?.answers.map((item) => item.id)).toContain('projected-eod')
    expect(groups[3]?.answers.map((item) => item.id)).toContain('metric-quality')
  })

  it('omits missing catalog entries without inventing dashboard answers', () => {
    const groups = selectOperatorAnswerDashboardGroups([answer('site-health')])
    expect(groups.find((group) => group.id === 'priority')?.answers.map((item) => item.id)).toEqual([
      'site-health',
    ])
    expect(groups.find((group) => group.id === 'live')?.answers).toEqual([])
  })
})
