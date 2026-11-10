import { ENGINE_STATUS, type EngineStatus } from '../../constants/corrections.ts'
import type { EngineReport } from '../../services/correctionPipeline.ts'

interface StatusStyle {
  dotClass: string
  label: string
}

const STATUS_STYLE: Record<EngineStatus, StatusStyle> = {
  [ENGINE_STATUS.used]: { dotClass: 'bg-emerald-500', label: 'ran' },
  [ENGINE_STATUS.unavailable]: { dotClass: 'bg-amber-400', label: 'unavailable' },
  [ENGINE_STATUS.failed]: { dotClass: 'bg-rose-500', label: 'failed' },
}

export interface EngineStatusListProps {
  engines: readonly EngineReport[]
}

const EngineStatusList = ({ engines }: EngineStatusListProps) => {
  const notices = engines.filter((engine) => engine.message)

  return (
    <div className="flex flex-col gap-1.5">
      <ul aria-label="Engines used" className="flex flex-wrap gap-1.5">
        {engines.map((engine) => (
          <li
            key={engine.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <span className={`size-1.5 rounded-full ${STATUS_STYLE[engine.status].dotClass}`} aria-hidden="true" />
            {engine.label}
            <span className="text-slate-400 dark:text-neutral-500">{STATUS_STYLE[engine.status].label}</span>
          </li>
        ))}
      </ul>
      {notices.map((engine) => (
        <p key={engine.label} role="status" className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {engine.message}
        </p>
      ))}
    </div>
  )
}

export default EngineStatusList
