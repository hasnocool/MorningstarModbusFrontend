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
import {
  localDayKey,
  medianSummary,
  shiftDay,
  summarizeDay,
  type DayLabHistories,
} from '../day-lab'
import { useForecastAccuracy, useSystemForecast } from '../forecast-api'
import {
  useSystemBaselines,
  useSystemHealthScore,
  useSystemIncidents,
} from '../intelligence-api'
import {
  buildOperatorAnswers,
  filterOperatorAnswers,
  type OperatorAnswer,
  type OperatorAnswerCategory,
} from '../operator-answers'
import {
  useSystemHealth,
  useSystemHistory,
  useSystemLatest,
  useSystems,
} from '../system-api'

const categories: Array<'All' | OperatorAnswerCategory> = [
  'All',
  'Now',
  'Forecast',
  'Performance',
  'Health',
  'Data quality',
  'Investigation',
]

function dayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString()
}

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
  const systems = useSystems()
  const systemUid = systems.data?.[0]?.system_uid
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'All' | OperatorAnswerCategory>('All')
  const [now] = useState(() => new Date())
  const today = localDayKey(now)
  const throughMinute = now.getHours() * 60 + now.getMinutes()
  const queryFrom = dayStart(shiftDay(today, -7))
  const queryTo = now.toISOString()

  const latest = useSystemLatest(systemUid)
  const health = useSystemHealth(systemUid)
  const forecast = useSystemForecast(systemUid)
  const accuracy = useForecastAccuracy(systemUid)
  const healthScore = useSystemHealthScore(systemUid)
  const incidents = useSystemIncidents(systemUid, 'active', undefined, 200)
  const baselines = useSystemBaselines(systemUid)

  const solarHistory = useSystemHistory(systemUid, 'solar_input_power_w', queryFrom, queryTo, '15m', 1200)
  const outputHistory = useSystemHistory(systemUid, 'charge_output_power_w', queryFrom, queryTo, '15m', 1200)
  const voltageHistory = useSystemHistory(systemUid, 'battery_voltage_v', queryFrom, queryTo, '15m', 1200)
  const currentHistory = useSystemHistory(systemUid, 'battery_charge_current_a', queryFrom, queryTo, '15m', 1200)

  const histories: DayLabHistories = useMemo(
    () => ({
      solar: solarHistory.data,
      output: outputHistory.data,
      voltage: voltageHistory.data,
      current: currentHistory.data,
    }),
    [currentHistory.data, outputHistory.data, solarHistory.data, voltageHistory.data],
  )

  const todaySummary = useMemo(
    () => summarizeDay(histories, today, 15, throughMinute),
    [histories, throughMinute, today],
  )

  const recentMedian = useMemo(() => {
    const summaries = Array.from({ length: 7 }, (_, index) =>
      summarizeDay(histories, shiftDay(today, -(index + 1)), 15, throughMinute),
    ).filter((summary) => summary.observedBuckets > 0)
    return medianSummary(summaries, 'Prior 7-day median')
  }, [histories, throughMinute, today])

  const answers = useMemo(
    () =>
      buildOperatorAnswers({
        latestMetrics: latest.data?.metrics,
        health: health.data,
        healthScore: healthScore.data,
        incidents: incidents.data,
        baseline: baselines.data?.solar_input_power,
        forecast: forecast.data,
        accuracy: accuracy.data,
        today: todaySummary,
        recentMedian,
      }),
    [
      accuracy.data,
      baselines.data?.solar_input_power,
      forecast.data,
      health.data,
      healthScore.data,
      incidents.data,
      latest.data?.metrics,
      recentMedian,
      todaySummary,
    ],
  )

  const visibleAnswers = useMemo(
    () => filterOperatorAnswers(answers, query, category),
    [answers, category, query],
  )
  const answeredCount = answers.filter((item) => item.status !== 'unknown').length
  const unknownCount = answers.length - answeredCount
  const activeIncidentCount = incidents.data?.length ?? 0
  const errorCount = [
    latest.isError,
    health.isError,
    forecast.isError,
    accuracy.isError,
    healthScore.isError,
    incidents.isError,
    baselines.isError,
    solarHistory.isError,
    outputHistory.isError,
    voltageHistory.isError,
    currentHistory.isError,
  ].filter(Boolean).length
  const loading = [
    latest.isLoading,
    health.isLoading,
    forecast.isLoading,
    healthScore.isLoading,
    incidents.isLoading,
    baselines.isLoading,
  ].some(Boolean)

  if (!systemUid) {
    if (systems.isLoading) return <LoadingState label="Loading site questions…" />
    if (systems.isError) return <ErrorState title="Site inventory unavailable" />
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
          status={unknownCount ? 'warning' : 'online'}
          label={`${answeredCount}/${answers.length} answerable now`}
        />
      </div>

      {errorCount > 0 && (
        <ErrorState
          title="Some evidence sources are unavailable"
          detail={`${errorCount} source request(s) failed. Questions backed by other evidence remain usable; missing answers stay Unknown.`}
        />
      )}

      <div className="site-summary-grid">
        <SummaryStat
          label="Canonical questions"
          value={answers.length}
          helper="deterministic answer catalog"
          icon={<CircleHelp size={18} />}
        />
        <SummaryStat
          label="Answered now"
          value={answeredCount}
          helper={`${unknownCount} need more evidence`}
          icon={<ShieldCheck size={18} />}
        />
        <SummaryStat
          label="Active incidents"
          value={activeIncidentCount}
          helper="persistent backend findings"
          icon={<Activity size={18} />}
        />
        <SummaryStat
          label="Site health"
          value={healthScore.data?.score ?? '—'}
          helper={healthScore.data ? `${healthScore.data.status} / 100` : 'score unavailable'}
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
          {loading && <span>Refreshing live evidence…</span>}
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
