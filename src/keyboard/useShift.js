import { useEffect, useState } from 'react';

/** Shift = on-screen Shift key (sticky) XOR a physically held Shift key. */
export function useShift() {
  const [stickyShift, setStickyShift] = useState(false);
  const [physShift, setPhysShift] = useState(false);

  useEffect(() => {
    const onDown = (e) => { if (e.key === 'Shift') setPhysShift(true); };
    const onUp = (e) => { if (e.key === 'Shift') setPhysShift(false); };
    const onBlur = () => setPhysShift(false);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return {
    shiftActive: stickyShift !== physShift,
    stickyShift,
    toggleSticky: () => setStickyShift((s) => !s),
    clearSticky: () => setStickyShift(false)
  };
}
