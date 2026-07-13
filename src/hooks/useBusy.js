import { useState, useCallback, useRef, useEffect } from "react";

export function useBusy(asyncFn) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const fnRef = useRef(asyncFn);
  useEffect(() => { fnRef.current = asyncFn; }, [asyncFn]);
  const wrapped = useCallback(async (...args) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fnRef.current(...args); 
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []); 
  return [busy, wrapped];
}