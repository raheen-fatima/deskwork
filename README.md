# Deskwork

[Image Preview Application](./src/public/previewImage.png)

Browser-based document + spreadsheet editor with Urdu typing, an on-screen keyboard and export to
DOCX / PDF / JPG / HTML / XLSX / CSV. Ported from the single `deskwork.html` file to a Vite + React project.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## On-screen keyboard modes

Click the keyboard button in the top bar, then pick a mode with the three icons in the keyboard header:

| Mode | Behaviour |
| --- | --- |
| **Bottom** | Fixed to the bottom edge, centred, ~60% of the screen width (min 560px), fixed proportions. The app reserves space so nothing is hidden behind it. |
| **Sidebar** | Right-hand panel (drag its left edge, or use Left/Right arrows on the grip, to resize). Keys fill the panel width and scale to its height, no scrolling. |
| **Floating** | Same size as Bottom, drag it by the header, stays above everything and on screen. Position is remembered. |

Mode, open/closed state, sidebar width and floating position are saved in `localStorage`
(`kbmode`, `kbopen`, `kbw`, `kbpos`). Default mode is Sidebar (the previous behaviour).
Sizes are CSS variables (`--kb-w`, `--kb-h`) at the top of `src/styles/keyboard.css`.

## Project layout

```
src/
  main.jsx, App.jsx            entry + top-level state (theme, language, active file, keyboard)
  screens/                     HomeScreen, EditorShell (title, export menu, save status)
  editors/word/                WordEditor + page / image helpers
  editors/sheet/               SpreadsheetEditor, formula engine, cell refs, charts
  keyboard/                    OnScreenKeyboard, KeyboardKeys, ModeSwitcher, settings + drag hooks,
                               Urdu map, virtual-input dispatch, global Urdu keydown
  export/                      docx / pdf / jpg / html / xlsx / csv exporters
  hooks/                       useAutosave, useFileLibrary, useTheme
  lib/                         localStorage helpers, file index + payload loading
  styles/                      one stylesheet per area, imported from styles/index.css
```

Export libraries (html2canvas, jsPDF, docx, ExcelJS) are still loaded lazily from jsDelivr the first time you
export, exactly as in the original, so the app has no extra npm dependencies. See `src/export/loadLibs.js`.
