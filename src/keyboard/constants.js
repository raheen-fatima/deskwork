export const KB_MODES = [
  { id: 'bottom', label: 'Bottom', icon: ['M3 4h18v16H3z', 'M3 14h18'] },
  { id: 'sidebar', label: 'Sidebar', icon: ['M3 4h18v16H3z', 'M15 4v16'] },
  { id: 'floating', label: 'Floating', icon: ['M4 4h12v10H4z', 'M9 10h11v10H9z'] }
];

// The keyboard used to live in the right-hand sidebar, so that stays the default.
export const DEFAULT_MODE = 'sidebar';

export const SIDEBAR_MIN_WIDTH = 240;

export function isValidMode(mode) {
  return KB_MODES.some((m) => m.id === mode);
}
