import { BACKGROUND_STATUS } from '../hooks/useBackgroundStatus.js'

const STATUS_LABEL = {
  [BACKGROUND_STATUS.checking]: 'Connecting…',
  [BACKGROUND_STATUS.connected]: 'Ready',
  [BACKGROUND_STATUS.unavailable]: 'Background service unavailable',
}

const STATUS_DOT_CLASS = {
  [BACKGROUND_STATUS.checking]: 'bg-amber-400',
  [BACKGROUND_STATUS.connected]: 'bg-emerald-500',
  [BACKGROUND_STATUS.unavailable]: 'bg-rose-500',
}

const PopupHeader = ({ status, version }) => (
  <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
    <div>
      <h1 className="text-base font-semibold text-slate-900">WriteBetter</h1>
      <p className="text-xs text-slate-500">Local-first writing assistant</p>
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-600" role="status">
      <span className={`size-2 rounded-full ${STATUS_DOT_CLASS[status]}`} aria-hidden="true" />
      <span>{STATUS_LABEL[status]}</span>
      {version && <span className="text-slate-400">v{version}</span>}
    </div>
  </header>
)

export default PopupHeader
