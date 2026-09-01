import { SvgIcon } from '../components/SvgIcon.jsx';
import { KB_MODES } from './constants.js';

/** Bottom / Sidebar / Floating selector shown in the keyboard header. */
export function ModeSwitcher({ mode, onChange }) {
  return (
    <div className="kb-modes" role="group" aria-label="Keyboard display mode">
      {KB_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={'kb-mode-btn' + (mode === m.id ? ' active' : '')}
          aria-pressed={mode === m.id}
          aria-label={m.label + ' keyboard'}
          title={m.label}
          onClick={() => onChange(m.id)}
        >
          <SvgIcon d={m.icon} size={14} />
        </button>
      ))}
    </div>
  );
}
