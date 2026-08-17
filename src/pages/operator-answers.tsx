import { useMemo, useState } from 'react'
import { Activity, ArrowRight, CircleHelp, Search, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  SummaryStat,
} from '../components'
import { useOperatorAnswersData } from '../operator-answers-data'
import {
  filterOperatorAnswers,
  type OperatorAnswer,
  type OperatorAnswerCategory,
} from '../operator-answers'

const categories: Array<'All' | OperatorAnswerCategory> = [
  'All',
  'Now',
  'Forecast',
  'Performance',
  'Health',
  'Data quality',
  'Investigation',
]

function AnswerCard({ answer }: { answer: OperatorAnswer }) {
  return (
    <article className={`operator-answer-card status-${answer.status}`}>
      <div className="operator-answer-head">
        <div>
          <span>{answer.category}</span>
          <h3>{answer.question}</h3>
        </div>
        <StatusBadge status={answer.status} />
      </div>
      <strong className="operator-answer-value">{answer.answer}</strong>
      <p>{answer.detail}</p>
      {answer.confidence && (
        <div className="operator-answer-confidence">
          <ShieldCheck size={14} /> {answer.confidence} confidence
        </div>
      )}
      {!!answer.evidence.length && (
        <details className="operator-answer-evidence">
          <summary>{answer.evidence.length} evidence item{answer.evidence.length === 1 ? '' : 's'}</summary>
          <ul>
            {answer.evidence.map((item, index) => (
              <li key={`${answer.id}-evidence-${index}`}>{item}</li>
            ))}
          </ul>
        </details>
      )}
      <Link className="operator-answer-action" to={answer.href}>
        {answer.actionLabel} <ArrowRight size={15} />
      </Link>
    </article>
  )
}

export default function OperatorAnswersPage() {
  const data = useOperatorAnswersData({ includeComparisons: true })
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'All' | OperatorAnswerCategory>('All')

  const visibleAnswers = useMemo(
    () => filterOperatorAnswers(data.answers, query, category),
    [category, data.answers, query],
  )

  if (!data.systemUid) {
    if (data.systemsLoading) return <LoadingState label="Loading site questions…" />
    if (data.systemsError) return <ErrorState title="Site inventory unavailable" />
    return <EmptyState title="No site is configured">Operator Answers appears when a system is enrolled.</EmptyState>
  }

  return (
    <div className="page operator-answers-page">
      <div className="page-heading site-heading operator-answers-heading">
        <div>
          <span className="eyebrow">Question-driven operations</span>
          <h1>Operator Answers</h1>
          <p>
            Ask the questions operators actually care about. Each answer is synthesized deterministically from
            existing Morningstar API evidence and links back to the page that proves it. Correlation stays
            separate from causation, and missing evidence remains explicit.
          </p>
        </div>
        <StatusBadge
          status={data.unknownCount ? 'warning' : 'online'}
          label={`${data.answeredCount}/${data.answers.length} answerable now`}
        />
      </div>

      {data.errorCount > 0 && (
        <ErrorState
          title="Some evidence sources are unavailable"
          detail={`${data.errorCount} source request(s) failed. Questions backed by other evidence remain usable; missing answers stay Unknown.`}
        />
      )}

      <div className="site-summary-grid">
        <SummaryStat
          label="Canonical questions"
          value={data.answers.length}
          helper="deterministic answer catalog"
          icon={<CircleHelp size={18} />}
        />
        <SummaryStat
          label="Answered now"
          value={data.answeredCount}
          helper={`${data.unknownCount} need more evidence`}
          icon={<ShieldCheck size={18} />}
        />
        <SummaryStat
          label="Active incidents"
          value={data.activeIncidentCount}
          helper="persistent backend findings"
          icon={<Activity size={18} />}
        />
        <SummaryStat
          label="Site health"
          value={data.healthScore ?? '—'}
          helper={data.healthScore !== undefined ? `${data.healthStatus ?? 'unknown'} / 100` : 'score unavailable'}
          icon={<ShieldCheck size={18} />}
        />
      </div>

      <Panel eyebrow="Find an answer" title="What do you want to know?">
        <div className="operator-answer-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: solar left today, Float, battery voltage, telemetry gaps, what needs attention…"
            aria-label="Search operator questions"
          />
        </div>
        <div className="operator-answer-categories" role="group" aria-label="Question categories">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? 'active' : ''}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="operator-answer-search-meta">
          <span>{visibleAnswers.length} matching question{visibleAnswers.length === 1 ? '' : 's'}</span>
          {data.loading && <span>Refreshing live evidence…</span>}
        </div>
      </Panel>

      {!visibleAnswers.length ? (
        <EmptyState title="No matching canonical question">
          Try a broader phrase or choose All. This workspace deliberately searches a transparent question
          catalog rather than inventing an unsupported free-form answer.
        </EmptyState>
      ) : (
        <div className="operator-answer-grid">
          {visibleAnswers.map((item) => (
            <AnswerCard key={item.id} answer={item} />
          ))}
        </div>
      )}

      <div className="operator-answer-semantics">
        <CircleHelp size={18} />
        <div>
          <strong>How these answers work</strong>
          <span>
            Operator Answers is not an LLM diagnosis layer. It composes normalized telemetry, capability states,
            local forecasts, historical 7-day comparisons, health scores, and persistent incidents using fixed,
            testable rules. Every answer retains an evidence path into Forecast, Day Lab, Replay, Intelligence,
            Power Flow, History, or Controllers.
          </span>
        </div>
      </div>
    </div>
  )
}
