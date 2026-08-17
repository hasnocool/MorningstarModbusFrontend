import { ArrowRight, CircleHelp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LoadingState, StatusBadge } from './components'
import {
  selectOperatorAnswerDashboardGroups,
} from './operator-answer-dashboard-model'
import { useOperatorAnswersData } from './operator-answers-data'
import './operator-answer-dashboard.css'

export function OperatorAnswersDashboard() {
  const data = useOperatorAnswersData({ includeComparisons: false })
  if (!data.systemUid) return null

  const groups = selectOperatorAnswerDashboardGroups(data.answers)
  const visibleAnswers = groups.flatMap((group) => group.answers)
  const answered = visibleAnswers.filter((answer) => answer.status !== 'unknown').length
  const unknown = visibleAnswers.length - answered

  return (
    <section className="operator-answer-dashboard" aria-labelledby="operator-answer-dashboard-title">
      <div className="operator-answer-dashboard-header">
        <div>
          <span className="eyebrow">Operator Answers</span>
          <h2 id="operator-answer-dashboard-title">Questions the dashboard can answer now</h2>
          <p>
            High-signal answers are grouped by operator workflow. Open any answer for its source evidence, or
            use the full Questions workspace for all 28 canonical questions and matched-time comparisons.
          </p>
        </div>
        <Link className="secondary-button" to="/site/questions">
          <CircleHelp size={16} /> View all questions
        </Link>
      </div>

      {data.loading && !answered ? (
        <LoadingState label="Building operator answers…" />
      ) : (
        <div className="operator-answer-dashboard-groups">
          {groups.map((group) => (
            <div className="operator-answer-dashboard-group" key={group.id}>
              <div className="operator-answer-dashboard-group-head">
                <strong>{group.label}</strong>
                <span>{group.description}</span>
              </div>
              <div className="operator-answer-dashboard-list">
                {group.answers.map((answer) => (
                  <div className="operator-answer-dashboard-row" key={answer.id}>
                    <div className="operator-answer-dashboard-copy">
                      <span>{answer.question}</span>
                      <strong>{answer.answer}</strong>
                    </div>
                    <div className="operator-answer-dashboard-actions">
                      <StatusBadge status={answer.status} />
                      <Link to={answer.href}>
                        Evidence <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="operator-answer-dashboard-meta">
        <span>{answered}/{visibleAnswers.length} dashboard answers available</span>
        {unknown > 0 && <span>{unknown} remain Unknown until evidence is available</span>}
        {data.activeIncidentCount > 0 && <span>{data.activeIncidentCount} active incident(s)</span>}
        {data.errorCount > 0 && <span>{data.errorCount} evidence source request(s) unavailable</span>}
        {data.loading && <span>Refreshing evidence…</span>}
      </div>
    </section>
  )
}
