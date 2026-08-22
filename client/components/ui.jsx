import { ICONS } from '../lib/icons.js'

export function statusClass(status) {
  return ['green','amber','red','white'].includes(status) ? `status-${status}` : 'status-white'
}

export function Pill({status,children}) {
  const cls=['green','amber','red'].includes(status)?status:'neutral'
  return <span className={`pill ${cls}`}>{children}</span>
}

export function Modal({title,onClose,children,footer}){
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2><button type="button" className="icon-button open" onClick={onClose} aria-label="Close"><ICONS.X size={17}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  )
}
