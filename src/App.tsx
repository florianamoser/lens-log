import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../package.json';
import { exportCsv } from './csv';
import { formatShift, nextFrame, normalizeFrame } from './defaults';
import { createId } from './id';
import { createBackup, getEntries, getLenses, getSettings, initializeStore, restoreBackup, saveEntries, saveEntry, saveLens, saveSettings, syncStore } from './storage';
import type { AppSettings, Entry, Lens, ShiftProfile } from './types';

type SyncState = 'checking' | 'syncing' | 'synced' | 'offline' | 'unavailable';
type TextSize = 'compact' | 'large';
type StoragePersistence = 'checking' | 'persistent' | 'standard' | 'unsupported';
type AxisColorMode = 'monochrome' | 'color';

const SHIFT_PROFILES: Record<ShiftProfile, { name: string; xSign: 1 | -1; ySign: 1 | -1; directions: string; explanation: string }> = {
  c1: {
    name: 'IMAGE',
    xSign: -1,
    ySign: -1,
    directions: 'Image left +X · Image right −X · Rise +Y · Fall −Y',
    explanation: 'Use the direction of the resulting image: slide up when the composition is looking up. Slide down when it is pointing down, and likewise for left and right. This corresponds to the movement of the lens on the front standard.',
  },
  alpa: {
    name: 'ALPA',
    xSign: 1,
    ySign: -1,
    directions: 'Back left −X · Back right +X · Rise +Y · Fall −Y',
    explanation: 'For cameras with vertical shift on the front standard and horizontal shift on the back: slide vertically with the image direction, but horizontally with the movement of the back standard.',
  },
  pico: {
    name: 'PICO',
    xSign: 1,
    ySign: 1,
    directions: 'Back left −X · Back right +X · Rise −Y · Fall +Y',
    explanation: 'For the ARCA-SWISS Pico and other cameras with both shift axes on the back standard: slide in the same direction as the back moves. Moving the back left or up produces negative values; right or down produces positive values.',
  },
};

function formatLogDate(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ShiftValue({ value }: { value: number }) {
  const [whole, fraction] = formatShift(value).split('.');
  return <strong aria-label={formatShift(value)}><span className="shift-whole">{whole}</span><span className="shift-decimal" aria-hidden="true">.</span><span className="shift-fraction">{fraction}</span></strong>;
}

function FrameControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [typing, setTyping] = useState(false);
  const gesture = useRef({ startY: 0, startValue: 0, moved: false, step: 0 });
  const adjust = (amount: number) => {
    const next = ((Number(value || 0) + amount) % 10000 + 10000) % 10000;
    onChange(String(next).padStart(4, '0'));
  };
  const begin = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { startY: event.clientY, startValue: Number(value || 0), moved: false, step: 0 };
  };
  const scrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const distance = event.clientY - gesture.current.startY;
    if (Math.abs(distance) > 5) gesture.current.moved = true;
    if (!gesture.current.moved) return;
    const step = Math.round(distance / 12);
    if (step !== gesture.current.step) {
      gesture.current.step = step;
      const next = ((gesture.current.startValue + step) % 10000 + 10000) % 10000;
      onChange(String(next).padStart(4, '0'));
    }
  };
  const keys = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      adjust(1);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      adjust(-1);
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setTyping(true);
    }
  };
  return (
    <div className="frame-field">
      {typing ? <input autoFocus value={value} onFocus={(event) => event.currentTarget.select()} onBlur={() => { onChange(normalizeFrame(value)); setTyping(false); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" aria-label="Frame number" /> :
        <button className="frame-scrubber" aria-label={`First frame ${normalizeFrame(value)}. Swipe down to increase, up to decrease, or tap to type.`} onPointerDown={begin} onPointerMove={scrub} onPointerUp={() => { if (!gesture.current.moved) setTyping(true); }} onPointerCancel={() => { gesture.current.moved = true; }} onKeyDown={keys}>
          <i aria-hidden="true">↑</i><strong>{normalizeFrame(value)}</strong><i aria-hidden="true">↓</i>
        </button>}
    </div>
  );
}

function VerticalSelector({ label, items, selectedId, onSelect, onManage }: { label: string; items: { id: string; value: string; aria: string }[]; selectedId: string; onSelect: (id: string) => void; onManage?: () => void }) {
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  return (
    <section className={`vertical-selector ${label.toLowerCase()}`}>
      <div className="selector-label">{onManage ? <button onClick={onManage}>{label}</button> : <span>{label}</span>}</div>
      <div className="selector-wheel" style={{ gridTemplateRows: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item, index) => <button key={item.id} className={index === selectedIndex ? 'current' : ''} aria-label={item.aria} aria-pressed={index === selectedIndex} onClick={() => onSelect(item.id)}><span>{item.value}</span></button>)}
      </div>
    </section>
  );
}

function MovementPad({ x, y, profile, onXChange, onYChange, onManage }: { x: number; y: number; profile: ShiftProfile; onXChange: (value: number) => void; onYChange: (value: number) => void; onManage: () => void }) {
  const convention = SHIFT_PROFILES[profile];
  const current = useRef({ x, y });
  const gesture = useRef({ startX: 0, startY: 0, valueX: x, valueY: y, axis: null as 'x' | 'y' | null });
  current.current = { x, y };
  const adjusted = (value: number) => Math.max(-20, Math.min(20, Math.round(value * 4) / 4));
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { startX: event.clientX, startY: event.clientY, valueX: current.current.x, valueY: current.current.y, axis: null };
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const distanceX = event.clientX - gesture.current.startX;
    const distanceY = event.clientY - gesture.current.startY;
    if (!gesture.current.axis && Math.max(Math.abs(distanceX), Math.abs(distanceY)) > 6) {
      gesture.current.axis = Math.abs(distanceX) >= Math.abs(distanceY) ? 'x' : 'y';
    }
    if (gesture.current.axis === 'x') onXChange(adjusted(gesture.current.valueX + Math.round(distanceX / 14) * 0.25 * convention.xSign));
    if (gesture.current.axis === 'y') onYChange(adjusted(gesture.current.valueY + Math.round(distanceY / 14) * 0.25 * convention.ySign));
  };
  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') onXChange(adjusted(current.current.x - 0.25 * convention.xSign));
    if (event.key === 'ArrowRight') onXChange(adjusted(current.current.x + 0.25 * convention.xSign));
    if (event.key === 'ArrowUp') onYChange(adjusted(current.current.y - 0.25 * convention.ySign));
    if (event.key === 'ArrowDown') onYChange(adjusted(current.current.y + 0.25 * convention.ySign));
  };
  return (
    <section className="movement-field">
      <div className="section-label"><button className="shift-settings-button" onClick={onManage}>Shift: {convention.name}</button><button className="shift-zero-button" onClick={() => { onXChange(0); onYChange(0); }}>Zero</button></div>
      <div className="movement-pad" role="application" tabIndex={0} aria-label={`Shift control. X ${formatShift(x)} millimetres, Y ${formatShift(y)} millimetres. Swipe left or right for X; up or down for Y.`} onPointerDown={begin} onPointerMove={move} onKeyDown={keys}>
        <button className="shift-arrow north" aria-label="Move up by 0.25 millimetres" onPointerDown={(event) => event.stopPropagation()} onClick={() => onYChange(adjusted(y - 0.25 * convention.ySign))}>↑</button>
        <button className="shift-arrow west" aria-label="Move left by 0.25 millimetres" onPointerDown={(event) => event.stopPropagation()} onClick={() => onXChange(adjusted(x - 0.25 * convention.xSign))}>←</button>
        <button className="shift-arrow east" aria-label="Move right by 0.25 millimetres" onPointerDown={(event) => event.stopPropagation()} onClick={() => onXChange(adjusted(x + 0.25 * convention.xSign))}>→</button>
        <button className="shift-arrow south" aria-label="Move down by 0.25 millimetres" onPointerDown={(event) => event.stopPropagation()} onClick={() => onYChange(adjusted(y + 0.25 * convention.ySign))}>↓</button>
        <div className="movement-readout"><span className="axis-x"><b>X</b><ShiftValue value={x} /></span><span className="axis-y"><b>Y</b><ShiftValue value={y} /></span><small>mm</small></div>
      </div>
    </section>
  );
}

function frameRange(entry: Entry, next?: Entry) {
  if (!next) return `${entry.frameNumber}+`;
  const start = Number(entry.frameNumber);
  const nextStart = Number(next.frameNumber);
  const distance = (nextStart - start + 10000) % 10000;
  if (!distance || distance > 25) return entry.frameNumber;
  const end = String((nextStart + 9999) % 10000).padStart(4, '0');
  return distance === 1 ? entry.frameNumber : `${entry.frameNumber}–${end}`;
}

export function frameRangeContains(entry: Entry, next: Entry | undefined, query: string) {
  if (query.length !== 4) return entry.frameNumber.includes(query);
  const start = Number(entry.frameNumber);
  const target = Number(query);
  if (!Number.isFinite(start) || !Number.isFinite(target)) return false;
  if (!next) return target === start;
  const nextStart = Number(next.frameNumber);
  const rangeLength = (nextStart - start + 10000) % 10000;
  if (!rangeLength || rangeLength > 25) return target === start;
  const targetDistance = (target - start + 10000) % 10000;
  return targetDistance < rangeLength;
}

function focalLength(lens: Lens) {
  const labelValue = lens.short.match(/\d+(?:\.\d+)?/);
  const nameValue = lens.name.match(/\d+(?:\.\d+)?\s*mm\b/i);
  return Number(labelValue?.[0] ?? nameValue?.[0].match(/\d+(?:\.\d+)?/)?.[0] ?? Number.POSITIVE_INFINITY);
}

function compareLenses(a: Lens, b: Lens) {
  return focalLength(a) - focalLength(b) || a.name.localeCompare(b.name);
}

function lensNameLines(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const lineCount = name.length > 40 ? 4 : 3;
  const lines: string[] = [];
  for (let line = 0; line < lineCount - 1; line += 1) {
    const remainingCharacters = words.join(' ').length;
    const target = remainingCharacters / (lineCount - line);
    const current: string[] = [];
    while (words.length && (!current.length || `${current.join(' ')} ${words[0]}`.trim().length <= target)) current.push(words.shift()!);
    lines.push(current.join(' '));
  }
  lines.push(words.join(' '));
  return lines;
}

function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [frame, setFrame] = useState('0001');
  const [lensId, setLensId] = useState('c645-35');
  const [aperture, setAperture] = useState('11');
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('checking');
  const [showHistory, setShowHistory] = useState(false);
  const [showLenses, setShowLenses] = useState(false);
  const [showShiftSettings, setShowShiftSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>(() => localStorage.getItem('lens-log-text-size') === 'large' ? 'large' : 'compact');
  const [storagePersistence, setStoragePersistence] = useState<StoragePersistence>('checking');
  const [axisColorMode, setAxisColorMode] = useState<AxisColorMode>(() => localStorage.getItem('lens-log-axis-color-mode') === 'color' ? 'color' : 'monochrome');
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const [entryPendingDelete, setEntryPendingDelete] = useState<Entry | null>(null);
  const [shiftProfile, setShiftProfile] = useState<ShiftProfile>(() => (localStorage.getItem('lens-log-shift-profile') as ShiftProfile | null) ?? 'pico');
  const [toast, setToast] = useState('');
  const [lensQuery, setLensQuery] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [saveConfirmation, setSaveConfirmation] = useState(0);
  const saveConfirmationTimer = useRef<number | undefined>(undefined);
  const backupInput = useRef<HTMLInputElement>(null);
  const settingsUpdatedAt = useRef('');
  const [newLens, setNewLens] = useState({ short: '', name: '', apertures: '4, 5.6, 8, 11, 16, 22' });

  const activeEntries = useMemo(() => entries.filter((entry) => !entry.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)), [entries]);
  const visibleLogEntries = useMemo(() => {
    const query = logQuery.replace(/\D/g, '').slice(0, 4);
    return query ? activeEntries.filter((entry, index) => frameRangeContains(entry, activeEntries[index + 1], query)) : activeEntries;
  }, [activeEntries, logQuery]);
  const orderedLenses = useMemo(() => lenses.filter((item) => !item.deleted).sort(compareLenses), [lenses]);
  const libraryLenses = useMemo(() => {
    const query = lensQuery.trim().toLocaleLowerCase();
    return query ? orderedLenses.filter((item) => `${item.short} ${item.name}`.toLocaleLowerCase().includes(query)) : orderedLenses;
  }, [lensQuery, orderedLenses]);
  const activeLenses = useMemo(() => orderedLenses.filter((lens) => lens.active), [orderedLenses]);
  const lens = orderedLenses.find((item) => item.id === lensId) ?? activeLenses[0];

  const applySettings = useCallback((settings: AppSettings, availableLenses: Lens[]) => {
    if (settings.updatedAt > settingsUpdatedAt.current) settingsUpdatedAt.current = settings.updatedAt;
    const selectedLens = availableLenses.find((item) => item.id === settings.lensId && !item.deleted);
    if (selectedLens) {
      setLensId(selectedLens.id);
      setAperture(selectedLens.apertures.includes(settings.aperture) ? settings.aperture : selectedLens.apertures[0]);
    }
    setShiftProfile(settings.shiftProfile);
    localStorage.setItem('lens-log-shift-profile', settings.shiftProfile);
  }, []);

  const refresh = useCallback(async () => {
    const [storedEntries, storedLenses, storedSettings] = await Promise.all([getEntries(), getLenses(), getSettings()]);
    setEntries(storedEntries);
    setLenses(storedLenses);
    const latest = storedEntries.filter((item) => !item.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
    if (latest && !editingId) {
      setFrame(nextFrame(latest.frameNumber));
      setX(latest.shiftX);
      setY(latest.shiftY);
    }
    let currentSettings = storedSettings.find((item) => item.id === 'current');
    if (!currentSettings) {
      currentSettings = {
        id: 'current',
        lensId: latest?.lensId ?? 'c645-35',
        aperture: latest?.aperture ?? '11',
        shiftProfile: latest?.shiftProfile ?? (localStorage.getItem('lens-log-shift-profile') as ShiftProfile | null) ?? 'pico',
        updatedAt: new Date().toISOString(),
      };
      await saveSettings(currentSettings);
    }
    if (!editingId) applySettings(currentSettings, storedLenses);
  }, [applySettings, editingId]);

  const synchronize = useCallback(async (quiet = false) => {
    if (!navigator.onLine) {
      setSyncState('offline');
      if (!quiet) setToast('Offline — everything remains saved on this device.');
      return;
    }
    setSyncState('syncing');
    try {
      const result = await syncStore();
      setEntries(result.entries);
      setLenses(result.lenses);
      const currentSettings = result.settings.find((item) => item.id === 'current');
      if (currentSettings) applySettings(currentSettings, result.lenses);
      setSyncState('synced');
      if (!quiet) setToast('Synced to server.');
    } catch (error) {
      console.error('[sync] failed:', error);
      setSyncState('unavailable');
      if (!quiet) setToast('Server unavailable, saving to device.');
    }
  }, [applySettings]);

  useEffect(() => {
    initializeStore().then(refresh).then(() => synchronize(true));
  }, [refresh, synchronize]);

  useEffect(() => {
    let active = true;
    const checkStoragePersistence = async () => {
      if (!navigator.storage?.persisted) {
        if (active) setStoragePersistence('unsupported');
        return;
      }
      try {
        let persistent = await navigator.storage.persisted();
        if (!persistent && navigator.storage.persist) persistent = await navigator.storage.persist();
        if (active) setStoragePersistence(persistent ? 'persistent' : 'standard');
      } catch {
        if (active) setStoragePersistence('unsupported');
      }
    };
    void checkStoragePersistence();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onFocus = () => synchronize(true);
    window.addEventListener('online', onFocus);
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('online', onFocus); window.removeEventListener('focus', onFocus); };
  }, [synchronize]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => () => window.clearTimeout(saveConfirmationTimer.current), []);

  useEffect(() => {
    const updateAvailable = (event: Event) => setUpdateWorker((event as CustomEvent<ServiceWorker>).detail);
    window.addEventListener('lens-log-update-available', updateAvailable);
    return () => window.removeEventListener('lens-log-update-available', updateAvailable);
  }, []);

  const installUpdate = () => {
    if (!updateWorker) return;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }, { once: true });
    updateWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  const persistSettings = useCallback(async (nextLensId: string, nextAperture: string, nextShiftProfile: ShiftProfile) => {
    const previousTime = Date.parse(settingsUpdatedAt.current) || 0;
    const updatedAt = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
    settingsUpdatedAt.current = updatedAt;
    const settings: AppSettings = { id: 'current', lensId: nextLensId, aperture: nextAperture, shiftProfile: nextShiftProfile, updatedAt };
    try {
      await saveSettings(settings);
      setSyncState('checking');
      window.setTimeout(() => synchronize(true), 100);
    } catch (error) {
      console.error('[settings] local persistence failed:', error);
      setToast('Settings could not be saved on this device.');
    }
  }, [synchronize]);

  const selectLens = (id: string) => {
    const selected = lenses.find((item) => item.id === id);
    if (!selected) return;
    const nextAperture = selected.apertures.includes(aperture) ? aperture : selected.apertures.includes('11') ? '11' : selected.apertures[0];
    setLensId(id);
    setAperture(nextAperture);
    void persistSettings(id, nextAperture, shiftProfile);
  };

  const selectAperture = (value: string) => {
    setAperture(value);
    if (lens) void persistSettings(lens.id, value, shiftProfile);
  };

  const selectShiftProfile = (profile: ShiftProfile) => {
    setShiftProfile(profile);
    localStorage.setItem('lens-log-shift-profile', profile);
    setX(0);
    setY(0);
    if (lens) void persistSettings(lens.id, aperture, profile);
  };

  const clearEditing = (lastFrame = frame) => {
    setEditingId(null);
    setFrame(nextFrame(normalizeFrame(lastFrame)));
  };

  const save = async () => {
    console.info('[save] clicked');
    if (!lens || !frame) {
      console.warn('[save] validation failed', { hasLens: Boolean(lens), hasFrame: Boolean(frame) });
      setToast('Choose a lens and enter a frame number before saving.');
      return;
    }
    console.info('[save] form validated');
    try {
      const now = new Date().toISOString();
      const normalized = normalizeFrame(frame);
      const previous = editingId ? entries.find((item) => item.id === editingId) : undefined;
      const entry: Entry = {
        id: editingId ?? createId(),
        frameNumber: normalized,
        lensId: lens.id,
        lensName: lens.name,
        lensShort: lens.short,
        aperture,
        shiftX: x,
        shiftY: y,
        shiftProfile,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        deleted: false,
      };
      console.info('[save] entry constructed:', entry);
      console.info('[save] writing entry to IndexedDB');
      await saveEntry(entry);
      console.info('[save] IndexedDB write successful');
      setEntries((current) => [...current.filter((item) => item.id !== entry.id), entry]);
      setEditingId(null);
      setFrame(normalized);
      navigator.vibrate?.(35);
      setSyncState('checking');
      window.clearTimeout(saveConfirmationTimer.current);
      setSaveConfirmation(Date.now());
      saveConfirmationTimer.current = window.setTimeout(() => setSaveConfirmation(0), 1700);
      window.setTimeout(() => synchronize(true), 100);
    } catch (error) {
      console.error('[save] failed before local persistence completed:', error);
      setToast('Save failed — the entry was not stored. Please try again.');
    }
  };

  const closeHistory = () => {
    setShowHistory(false);
    setLogQuery('');
  };

  const edit = (entry: Entry) => {
    setEditingId(entry.id);
    setFrame(entry.frameNumber);
    setLensId(entry.lensId);
    setAperture(entry.aperture);
    setX(entry.shiftX);
    setY(entry.shiftY);
    setShiftProfile(entry.shiftProfile ?? 'pico');
    localStorage.setItem('lens-log-shift-profile', entry.shiftProfile ?? 'pico');
    void persistSettings(entry.lensId, entry.aperture, entry.shiftProfile ?? 'pico');
    closeHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (entry: Entry) => {
    const removed = { ...entry, deleted: true, updatedAt: new Date().toISOString(), syncedAt: undefined };
    await saveEntry(removed);
    setEntries((current) => current.map((item) => item.id === removed.id ? removed : item));
    setEntryPendingDelete(null);
    setSyncState('checking');
    setToast(`Frame ${entry.frameNumber} removed.`);
    window.setTimeout(() => synchronize(true), 100);
  };

  const clearLog = async () => {
    if (!activeEntries.length) return;
    if (!window.confirm(`Delete all ${activeEntries.length} log entries? This will remove the complete composition history.`)) return;
    if (!window.confirm('Final confirmation: permanently clear the entire Lens Log? This cannot be undone.')) return;
    const now = new Date().toISOString();
    const removed = activeEntries.map((entry) => ({ ...entry, deleted: true, updatedAt: now, syncedAt: undefined }));
    const removedIds = new Set(removed.map((entry) => entry.id));
    await saveEntries(removed);
    setEntries((current) => current.map((entry) => removedIds.has(entry.id) ? { ...entry, deleted: true, updatedAt: now, syncedAt: undefined } : entry));
    setEditingId(null);
    setSyncState('checking');
    setToast('All log entries cleared.');
    window.setTimeout(() => synchronize(true), 100);
  };

  const exportBackup = async () => {
    try {
      const backup = await createBackup(packageJson.version);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      link.download = `lens-log-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setToast('Full Lens Log backup created.');
    } catch (error) {
      console.error('[backup] export failed:', error);
      setToast('The backup could not be created.');
    }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm('Restore this Lens Log backup on this device? Its records will replace the local copy and then synchronise with the server.')) return;
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      await restoreBackup(backup);
      await refresh();
      setSyncState('checking');
      setToast('Backup restored on this device.');
      window.setTimeout(() => synchronize(true), 100);
    } catch (error) {
      console.error('[backup] restore failed:', error);
      setToast(error instanceof Error ? error.message : 'The backup could not be restored.');
    }
  };

  const addLens = async (event: React.FormEvent) => {
    event.preventDefault();
    const apertures = newLens.apertures.split(',').map((item) => item.trim().replace(/^f\//, '')).filter(Boolean);
    if (!newLens.short.trim() || !newLens.name.trim() || !apertures.length) return;
    const now = new Date().toISOString();
    const added: Lens = { id: createId(), short: newLens.short.trim(), name: newLens.name.trim(), apertures, active: true, updatedAt: now };
    await saveLens(added);
    setLenses((current) => [...current, added]);
    setNewLens({ short: '', name: '', apertures: '4, 5.6, 8, 11, 16, 22' });
    setLensId(added.id);
    const nextAperture = apertures.includes('11') ? '11' : apertures[0];
    setAperture(nextAperture);
    void persistSettings(added.id, nextAperture, shiftProfile);
    setToast(`${added.short} added.`);
  };

  const toggleLens = async (item: Lens) => {
    if (item.active && activeLenses.length === 1) return;
    const updated = { ...item, active: !item.active, updatedAt: new Date().toISOString(), syncedAt: undefined };
    await saveLens(updated);
    setLenses((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    if (item.id === lensId && !updated.active) selectLens(activeLenses.find((candidate) => candidate.id !== item.id)!.id);
    setSyncState('checking');
    window.setTimeout(() => synchronize(true), 100);
  };

  const deleteLens = async (item: Lens) => {
    if (item.builtIn || !window.confirm(`Delete ${item.name}? Existing log entries will remain unchanged.`)) return;
    const replacementCandidate = activeLenses.find((candidate) => candidate.id !== item.id) ?? orderedLenses.find((candidate) => candidate.id !== item.id);
    const replacement = replacementCandidate && !replacementCandidate.active ? { ...replacementCandidate, active: true, updatedAt: new Date().toISOString(), syncedAt: undefined } : replacementCandidate;
    const removed: Lens = { ...item, active: false, deleted: true, updatedAt: new Date().toISOString(), syncedAt: undefined };
    await Promise.all([saveLens(removed), replacement && replacement !== replacementCandidate ? saveLens(replacement) : Promise.resolve()]);
    setLenses((current) => current.map((candidate) => candidate.id === removed.id ? removed : candidate.id === replacement?.id ? replacement : candidate));
    if (item.id === lensId && replacement) {
      setLensId(replacement.id);
      const nextAperture = replacement.apertures.includes(aperture) ? aperture : replacement.apertures.includes('11') ? '11' : replacement.apertures[0];
      setAperture(nextAperture);
      void persistSettings(replacement.id, nextAperture, shiftProfile);
    }
    setSyncState('checking');
    setToast(`${item.short} deleted.`);
    window.setTimeout(() => synchronize(true), 100);
  };

  const statusLabel = syncState === 'syncing' ? 'Syncing…'
    : syncState === 'synced' ? 'Synced'
    : syncState === 'offline' ? 'Offline'
    : syncState === 'unavailable' ? 'Server unavailable'
    : 'Checking server…';
  const selectTextSize = (size: TextSize) => {
    setTextSize(size);
    localStorage.setItem('lens-log-text-size', size);
  };
  const selectAxisColorMode = (mode: AxisColorMode) => {
    setAxisColorMode(mode);
    localStorage.setItem('lens-log-axis-color-mode', mode);
  };
  return (
    <main className={`app-shell text-size-${textSize} axis-color-${axisColorMode}`}>
      <header className="topbar">
        <div className="brand-lockup"><span>Lens Log</span></div>
        <nav>
          <button className="icon-button" aria-label="Information" onClick={() => setShowHelp(true)}>i</button>
        </nav>
      </header>

      <div className="workspace">
        <section className="capture-card">
          <FrameControl value={frame} onChange={setFrame} />

          <div className="instrument-stage">
            <VerticalSelector label="Lens" items={activeLenses.map((item) => ({ id: item.id, value: item.short, aria: `${item.short} millimetre lens` }))} selectedId={lens?.id ?? ''} onSelect={selectLens} onManage={() => setShowLenses(true)} />
            {lens && <p className="current-lens-name" aria-label={`Selected lens: ${lens.name}`}>{lensNameLines(lens.name).map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</p>}

            <MovementPad x={x} y={y} profile={shiftProfile} onXChange={setX} onYChange={setY} onManage={() => setShowShiftSettings(true)} />

            <VerticalSelector label="Aperture" items={(lens?.apertures ?? []).map((value) => ({ id: value, value: `f/${value}`, aria: `Aperture f/${value}` }))} selectedId={aperture} onSelect={selectAperture} />
          </div>

          {editingId && <button className="cancel-edit" onClick={() => clearEditing(activeEntries.at(-1)?.frameNumber)}>Cancel editing</button>}
          <footer className="instrument-footer">
            <div className={`status-stack footer-status ${syncState}`}><button className={`sync ${syncState}`} onClick={() => synchronize()}><i /><span>{statusLabel}</span></button></div>
            <button className="save-button" aria-label={`${editingId ? 'Update' : 'Save'} composition ${frame ? normalizeFrame(frame) : ''}`} disabled={!frame || !lens} onClick={save}><span>{editingId ? 'Update' : 'Save'}</span></button>
            <button className="log-button" onClick={() => setShowHistory(true)}>Log</button>
          </footer>
        </section>

      </div>

      {saveConfirmation > 0 && <div key={saveConfirmation} className="save-confirmation" role="status" aria-live="polite"><span>Values saved</span></div>}

      {showHistory && <div className="modal-backdrop" onMouseDown={closeHistory}><section className="modal history-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><div className="eyebrow">Continuous log</div><h2>All compositions</h2></div><button aria-label="Close" onClick={closeHistory}>×</button></div>
        <div className="log-actions"><button className="secondary-button" disabled={!activeEntries.length} onClick={() => exportCsv(entries)}>Export CSV</button><button className="secondary-button" onClick={() => synchronize()}>Sync now</button><button className="secondary-button" onClick={exportBackup}>Export full backup</button><button className="secondary-button" onClick={() => backupInput.current?.click()}>Restore backup</button><input ref={backupInput} className="backup-file-input" type="file" accept="application/json,.json" onChange={importBackup} /><button className="secondary-button clear-log-button" disabled={!activeEntries.length} onClick={clearLog}>Clear complete log</button></div>
        <label className="history-search"><span>Search by frame number</span><input type="search" inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="0000" value={logQuery} onChange={(event) => setLogQuery(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
        <div className="history-list">{[...visibleLogEntries].reverse().map((entry) => {
          const index = activeEntries.findIndex((item) => item.id === entry.id);
          return <article key={entry.id}><button className="history-main" onClick={() => edit(entry)}><b>{frameRange(entry, activeEntries[index + 1])}</b><span>{entry.lensName}</span><small>f/{entry.aperture} · <span className="axis-x-data">X {formatShift(entry.shiftX)}</span> · <span className="axis-y-data">Y {formatShift(entry.shiftY)}</span></small><time dateTime={entry.createdAt}>{formatLogDate(entry.createdAt)}</time></button><button className="delete-button" onClick={() => setEntryPendingDelete(entry)} aria-label={`Delete frame ${entry.frameNumber}`}>Delete</button></article>;
        })}{logQuery && !visibleLogEntries.length && <p className="history-empty">No frame matching {logQuery}</p>}</div>
      </section></div>}

      {entryPendingDelete && <div className="modal-backdrop delete-confirmation" onMouseDown={() => setEntryPendingDelete(null)}><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-entry-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><div className="eyebrow">Safety check</div><h2 id="delete-entry-title">Delete frame {entryPendingDelete.frameNumber}?</h2></div><button aria-label="Close" onClick={() => setEntryPendingDelete(null)}>×</button></div>
        <p>This removes the composition from the log. Are you sure?</p>
        <div className="delete-confirmation-actions"><button className="secondary-button" onClick={() => setEntryPendingDelete(null)}>Keep entry</button><button className="delete-entry-confirm" onClick={() => remove(entryPendingDelete)}>Delete entry</button></div>
      </section></div>}

      {showLenses && <div className="modal-backdrop" onMouseDown={() => setShowLenses(false)}><section className="modal lens-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><div className="eyebrow">Configuration</div><h2>Lens library</h2></div><button aria-label="Close" onClick={() => setShowLenses(false)}>×</button></div>
        <label className="lens-search"><span>Search {orderedLenses.length} lenses</span><div className="search-input-wrap"><input type="search" placeholder="Focal length, maker or model" value={lensQuery} onChange={(event) => setLensQuery(event.target.value)} />{lensQuery && <button type="button" aria-label="Clear lens filter" onClick={() => setLensQuery('')}>×</button>}</div></label>
        <div className="lens-library">{libraryLenses.map((item) => <article key={item.id}><div><b>{item.short} mm</b><span>{item.name}</span><small>f/{item.apertures.join(' · ')}</small></div><div className="lens-actions"><button className={item.active ? 'active-toggle' : ''} onClick={() => toggleLens(item)}>{item.active ? 'Shown' : 'Hidden'}</button>{!item.builtIn && <button className="delete-lens" onClick={() => deleteLens(item)}>Delete</button>}</div></article>)}</div>
        <form className="add-lens" onSubmit={addLens}><h3>Add another lens</h3><div><label>Button label<input placeholder="e.g. 80" value={newLens.short} onChange={(event) => setNewLens({ ...newLens, short: event.target.value })} /></label><label>Full name<input placeholder="Manufacturer and model" value={newLens.name} onChange={(event) => setNewLens({ ...newLens, name: event.target.value })} /></label></div><label>Apertures, separated by commas<input value={newLens.apertures} onChange={(event) => setNewLens({ ...newLens, apertures: event.target.value })} /></label><button type="submit" className="secondary-button">Add lens</button></form>
      </section></div>}

      {showShiftSettings && <div className="modal-backdrop" onMouseDown={() => setShowShiftSettings(false)}><section className="modal shift-settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><div className="eyebrow">Configuration</div><h2>Shift directions</h2></div><button aria-label="Close" onClick={() => setShowShiftSettings(false)}>×</button></div>
        <p className="shift-settings-intro">This setting changes how you use the central shift interface and how those movements translate into Capture One’s positive and negative shift values.</p>
        <p className="shift-settings-note capture-one-note"><b>Capture One convention:</b> relative to the sensor, lens left and rise are positive; lens right and fall are negative.</p>
        <div className="shift-profile-list">{(Object.keys(SHIFT_PROFILES) as ShiftProfile[]).map((id) => <button key={id} className={shiftProfile === id ? 'selected' : ''} onClick={() => selectShiftProfile(id)}><b>{SHIFT_PROFILES[id].name}</b><span><em>{SHIFT_PROFILES[id].directions}</em><small>{SHIFT_PROFILES[id].explanation}</small></span></button>)}</div>
      </section></div>}

      {showHelp && <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}><section className="modal help-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><div className="eyebrow">Field guide</div><h2>Offline by design</h2></div><button aria-label="Close" onClick={() => setShowHelp(false)}>×</button></div>
        <ol><li><b>Shift directions · {SHIFT_PROFILES[shiftProfile].name}</b><span>{SHIFT_PROFILES[shiftProfile].directions}. Change the convention through the underlined Shift label.</span></li><li><b>Use the movement field</b><span>Swipe horizontally for X or vertically for Y. The gesture locks to the first direction and moves in 0.25 mm steps.</span></li><li><b>Install on iPhone</b><span>Open this page in Safari, tap Share, then Add to Home Screen.</span></li><li><b>Work anywhere</b><span>Entries save to this device immediately and sync whenever the configured server is reachable.</span></li></ol>
        <div className="shared-settings-note"><div className="eyebrow">Current setup</div><b>Shared between devices</b><span>The selected lens, aperture and shift mode are shared after synchronisation.</span><small>The server creates a consistent SQLite backup in <code>/data/backups</code> at startup and once per day, retaining 14 daily files.</small></div>
        <div className={`storage-status-note ${storagePersistence}`}>
          <div className="eyebrow">Local storage</div>
          <b><i aria-hidden="true" />{storagePersistence === 'persistent' ? 'Persistent' : storagePersistence === 'standard' ? 'Browser-managed' : storagePersistence === 'unsupported' ? 'Status unavailable' : 'Checking…'}</b>
          <span>{storagePersistence === 'persistent'
            ? 'This browser has granted persistent storage. Local Lens Log data should not be removed automatically under storage pressure.'
            : storagePersistence === 'standard'
              ? 'Records are saved locally, but the browser may reclaim site data under storage pressure. Server synchronisation and backups remain important.'
              : storagePersistence === 'unsupported'
                ? 'This browser does not report whether local storage is persistent. Server synchronisation and backups remain important.'
                : 'Checking whether this browser protects local Lens Log data from automatic eviction.'}</span>
        </div>
        <div className="text-size-setting">
          <div className="interface-option-row">
            <div className="interface-option-copy"><div className="eyebrow">Text size</div><span>Choose the interface typography for this device.</span></div>
            <div className="text-size-options" role="group" aria-label="Text size">
              <button className={textSize === 'compact' ? 'selected' : ''} aria-pressed={textSize === 'compact'} onClick={() => selectTextSize('compact')}>Compact</button>
              <button className={textSize === 'large' ? 'selected' : ''} aria-pressed={textSize === 'large'} onClick={() => selectTextSize('large')}>Large</button>
            </div>
          </div>
          <div className="interface-option-row">
            <div className="interface-option-copy"><div className="eyebrow">Axis colour</div><span>Optionally distinguish X and Y using CAD-style colours.</span></div>
            <div className="text-size-options" role="group" aria-label="Axis colour">
              <button className={axisColorMode === 'monochrome' ? 'selected' : ''} aria-pressed={axisColorMode === 'monochrome'} onClick={() => selectAxisColorMode('monochrome')}>B/W</button>
              <button className={axisColorMode === 'color' ? 'selected' : ''} aria-pressed={axisColorMode === 'color'} onClick={() => selectAxisColorMode('color')}>Color</button>
            </div>
          </div>
        </div>
        <div className="about-app">
          <div className="eyebrow">About Lens Log</div>
          <p>Found a bug, have an idea, or simply want to share how Lens Log works for you? Please write to me at <a href="mailto:lenslog@florianamoser.xyz">lenslog@florianamoser.xyz</a>.</p>
          <p>I’d genuinely love to see where you use the app, so feel free to send me a photograph from the field. Every comment can help make Lens Log better, and perhaps your feature idea might even become part of it.</p>
          <p>Enjoy using the app!</p>
          <p>Lens Log was developed by Florian Amoser out of personal necessity, with the help of artificial intelligence.</p>
          <p>Lens Log is open-source software released under the <a href="/LICENSE.txt" target="_blank" rel="noreferrer">MIT License</a>.</p>
          <p>This software is provided as is, without warranty of any kind. Use it at your own risk, and verify important records independently. Software can contain bugs, and neither the developer nor contributors accept responsibility for lost, incomplete, or incorrect data.</p>
          <p>Lens and manufacturer names are trademarks of their respective owners. Their use is purely descriptive and does not imply any affiliation with or endorsement of Lens Log.</p>
          <p>Lens Log uses Geist Sans and Geist Mono, copyright 2024 The Geist Project Authors, licensed under the <a href="/fonts/OFL-Geist.txt" target="_blank" rel="noreferrer">SIL Open Font License 1.1</a>. It is built with open-source libraries including React, Vite, and TypeScript. Copyright and license details for third-party components are listed in the <a href="/THIRD_PARTY_LICENSES.txt" target="_blank" rel="noreferrer">third-party notices</a>.</p>
          <p className="app-version">Lens Log version {packageJson.version}</p>
        </div>
      </section></div>}

      {updateWorker && <div className="update-prompt" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div><strong id="update-title">Update available</strong><span>A new version of Lens Log is ready. Save the current values before reloading.</span></div>
        <div><button onClick={() => setUpdateWorker(null)}>Later</button><button className="apply-update" onClick={installUpdate}>Reload update</button></div>
      </div>}

      {toast && <button className="toast" onClick={() => setToast('')} aria-live="polite"><span>{toast}</span></button>}
    </main>
  );
}

export default App;
