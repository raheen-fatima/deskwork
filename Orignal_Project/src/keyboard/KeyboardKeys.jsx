import { KB_ROWS } from './layout.js';
import { URDU_MAP, isAsciiLetter } from './urduMap.js';

/** The key grid. Layout comes from KB_ROWS; sizing is entirely CSS (see styles/keyboard.css). */
export function KeyboardKeys({ lang, shiftActive, stickyShift, onToggleShift, onClearShift, onAction }) {
  return (
    <div className="kb-board">
      {KB_ROWS.map((row, rIdx) => (
        <div key={rIdx} className="kb-row">
          {row.map((item, kIdx) => {
            if (item === '__SHIFT__') {
              return (
                <button
                  key="shift"
                  type="button"
                  className={'kb-key wide' + (shiftActive ? ' active' : '')}
                  aria-pressed={shiftActive}
                  onClick={onToggleShift}
                >
                  <span className="kb-main kb-label">Shift</span>
                </button>
              );
            }
            if (item === '__BACK__') {
              return (
                <button
                  key="back"
                  type="button"
                  className="kb-key wide"
                  aria-label="Backspace"
                  onClick={() => onAction({ type: 'back' })}
                >
                  <span className="kb-main kb-label">⌫</span>
                </button>
              );
            }
            if (item === '__SPACE__') {
              return (
                <button
                  key="space"
                  type="button"
                  className="kb-key space"
                  onClick={() => onAction({ type: 'char', char: ' ', rawEn: ' ' })}
                >
                  <span className="kb-main kb-label">Space</span>
                </button>
              );
            }
            if (item === '__ENTER__') {
              return (
                <button
                  key="enter"
                  type="button"
                  className="kb-key wide"
                  onClick={() => onAction({ type: 'enter' })}
                >
                  <span className="kb-main kb-label">Enter</span>
                </button>
              );
            }
            if (typeof item === 'object') {
              // Urdu diacritic key
              return (
                <button
                  key={'dia_' + kIdx}
                  type="button"
                  className="kb-key ur"
                  aria-label={'Diacritic ' + item.label}
                  onClick={() =>
                    onAction({ type: 'char', char: item.glyph, directGlyph: item.glyph, rawEn: item.en })
                  }
                >
                  <span className="kb-main">{'\u25CC' + item.glyph}</span>
                  <span className="kb-en">{item.en}</span>
                </button>
              );
            }

            const lower = item;
            const upper = isAsciiLetter(lower) ? lower.toUpperCase() : lower;
            const activeEn = shiftActive ? upper : lower;
            const urMain = URDU_MAP[activeEn] || activeEn;
            const urAlt = URDU_MAP[shiftActive ? lower : upper] || '';
            const mainGlyph = lang === 'ur' ? urMain : activeEn;
            const altGlyph = lang === 'ur' ? (urAlt !== urMain ? urAlt : '') : shiftActive ? lower : upper;
            return (
              <button
                key={lower + '_' + kIdx}
                type="button"
                className={'kb-key' + (lang === 'ur' ? ' ur' : '')}
                onClick={() => {
                  onAction({ type: 'char', char: mainGlyph, rawEn: activeEn });
                  if (stickyShift) onClearShift();
                }}
              >
                <span className="kb-main">{mainGlyph}</span>
                <span className="kb-en">{lower}</span>
                {altGlyph ? <span className="kb-alt">{altGlyph}</span> : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
