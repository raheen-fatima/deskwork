import { useEffect, useMemo, useRef, useState } from 'react';
import { useFileLibrary } from './hooks/useFileLibrary.js';
import { useTheme } from './hooks/useTheme.js';
import { OnScreenKeyboard } from './keyboard/OnScreenKeyboard.jsx';
import { useGlobalUrduKeydown } from './keyboard/useGlobalUrduKeydown.js';
import { useKeyboardSettings } from './keyboard/useKeyboardSettings.js';
import { lsGet, lsSet } from './lib/storage.js';
import { EditorShell } from './screens/EditorShell.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';

export function App() {
  const library = useFileLibrary();
  const { theme, toggleTheme } = useTheme();
  const kb = useKeyboardSettings();
  const [activeFileId, setActiveFileId] = useState(null);
  const [lang, setLang] = useState(() => (lsGet('lang', 'en') === 'ur' ? 'ur' : 'en'));

  // Refs the keyboard and editors use to talk to each other
  const gridStartEditRef = useRef(null);
  const docRestoreFocusRef = useRef(null);

  useGlobalUrduKeydown(lang, gridStartEditRef);

  useEffect(() => {
    try { lsSet('lang', lang); } catch (e) {}
  }, [lang]);

  const toggleLang = () => setLang((l) => (l === 'ur' ? 'en' : 'ur'));

  const activeFileMeta = useMemo(
    () => library.files.find((f) => f.id === activeFileId) || null,
    [library.files, activeFileId]
  );

  const sharedChrome = {
    theme,
    onToggleTheme: toggleTheme,
    lang,
    onToggleLang: toggleLang,
    kbOpen: kb.open,
    onToggleKb: kb.toggleOpen
  };

  const rootClass = 'app-root' + (kb.open && kb.mode === 'bottom' ? ' kb-bottom-open' : '');

  return (
    <div className={rootClass}>
      <div className="app-main">
        {activeFileMeta ? (
          <EditorShell
            fileMeta={activeFileMeta}
            onBack={() => {
              library.reload();
              setActiveFileId(null);
            }}
            onIndexTouch={library.touchFile}
            gridStartEditRef={gridStartEditRef}
            docRestoreFocusRef={docRestoreFocusRef}
            {...sharedChrome}
          />
        ) : (
          <HomeScreen
            files={library.files}
            onOpenFile={setActiveFileId}
            onCreateFile={(type) => setActiveFileId(library.createFile(type))}
            onDuplicateFile={library.duplicateFile}
            onDeleteFile={(id) => {
              library.deleteFile(id);
              if (activeFileId === id) setActiveFileId(null);
            }}
            {...sharedChrome}
          />
        )}
      </div>
      <OnScreenKeyboard
        settings={kb}
        lang={lang}
        gridStartEditRef={gridStartEditRef}
        docRestoreFocusRef={docRestoreFocusRef}
      />
    </div>
  );
}
