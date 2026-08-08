// localStorage persistence for saved pitches + internal notes, keyed per lead.
import { useCallback, useEffect, useState } from "react";

export type SavedPitch = {
  text: string;
  savedAt: string; // ISO
};

export type LeadRecord = {
  notes: string;
  pitches: SavedPitch[];
};

export type LeadStore = Record<string, LeadRecord>;

const KEY = "smart-leads-agent:v1";

export function leadKey(hoardingId: string, customerId: string) {
  return `${hoardingId}::${customerId}`;
}

function read(): LeadStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LeadStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: LeadStore) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — ignore */
  }
}

const EMPTY: LeadRecord = { notes: "", pitches: [] };

export function useLeadStore() {
  const [store, setStore] = useState<LeadStore>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStore(read());
    setHydrated(true);
  }, []);

  const update = useCallback((key: string, fn: (rec: LeadRecord) => LeadRecord) => {
    setStore((prev) => {
      const next = { ...prev, [key]: fn(prev[key] ?? EMPTY) };
      write(next);
      return next;
    });
  }, []);

  const getRecord = useCallback((key: string) => store[key] ?? EMPTY, [store]);

  const setNotes = useCallback(
    (key: string, notes: string) => update(key, (r) => ({ ...r, notes })),
    [update],
  );

  const savePitch = useCallback(
    (key: string, text: string) =>
      update(key, (r) => ({
        ...r,
        pitches: [{ text, savedAt: new Date().toISOString() }, ...r.pitches].slice(0, 20),
      })),
    [update],
  );

  const removePitch = useCallback(
    (key: string, savedAt: string) =>
      update(key, (r) => ({ ...r, pitches: r.pitches.filter((p) => p.savedAt !== savedAt) })),
    [update],
  );

  return { store, hydrated, getRecord, setNotes, savePitch, removePitch };
}
