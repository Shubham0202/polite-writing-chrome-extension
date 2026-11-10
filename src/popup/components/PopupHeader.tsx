import { BACKGROUND_STATUS, type BackgroundStatus } from '../hooks/useBackgroundStatus.ts'

const STATUS_LABEL: Record<BackgroundStatus, string> = {
  [BACKGROUND_STATUS.checking]: 'Connecting…',
  [BACKGROUND_STATUS.connected]: 'Ready',
  [BACKGROUND_STATUS.unavailable]: 'Background service unavailable',
}

const STATUS_DOT_CLASS: Record<BackgroundStatus, string> = {
  [BACKGROUND_STATUS.checking]: 'bg-amber-400',
  [BACKGROUND_STATUS.connected]: 'bg-emerald-500',
  [BACKGROUND_STATUS.unavailable]: 'bg-rose-500',
}

export interface PopupHeaderProps {
  status: BackgroundStatus
  version: string | null
}

const PopupHeader = ({ status, version }: PopupHeaderProps) => (
  <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-neutral-700">
    <div>
      <h1 className="text-base font-semibold text-slate-900 dark:text-neutral-100">WriteBetter</h1>
      <p className="text-xs text-slate-500 dark:text-neutral-400">Local-first writing assistant</p>
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-400" role="status">
      <span className={`size-2 rounded-full ${STATUS_DOT_CLASS[status]}`} aria-hidden="true" />
      <span>{STATUS_LABEL[status]}</span>
      {version && <span className="text-slate-400 dark:text-neutral-500">v{version}</span>}
    </div>
  </header>
)

export default PopupHeader
