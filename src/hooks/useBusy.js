import { useState, useCallback, useRef, useEffect } from "react";

export function useBusy(asyncFn) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const fnRef = useRef(asyncFn);
  useEffect(() => {
    fnRef.current = asyncFn;
  }, [asyncFn]);

  const wrapped = useCallback(async (...args) => {
    if (busyRef.current) return;

    // 🛡️ Filter out React SyntheticEvents accidentally passed from onClick
    // This ensures the underlying handler receives actual data arguments, not the click event.
    const cleanArgs = args.filter((arg) => !(arg && arg.nativeEvent));

    busyRef.current = true;
    setBusy(true);
    try {
      await fnRef.current(...cleanArgs);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, wrapped];
}
