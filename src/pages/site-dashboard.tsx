import { OperatorAnswersDashboard } from '../operator-answer-dashboard'
import { SiteOverviewPage } from './site'
import '../site-dashboard.css'

export default function SiteDashboardPage() {
  return (
    <div className="site-dashboard-composition">
      <SiteOverviewPage />
      <div className="page site-page site-dashboard-answers">
        <OperatorAnswersDashboard />
      </div>
    </div>
  )
}
