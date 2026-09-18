import type { Entry } from './types';

function quote(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function frameSequence(first: string, next?: string) {
  if (!next) return [first];
  const start = Number(first);
  const end = Number(next);
  const distance = (end - start + 10000) % 10000;
  if (distance === 0 || distance > 25) return [first];
  return Array.from({ length: distance }, (_, index) => String((start + index) % 10000).padStart(4, '0'));
}

export function exportCsv(entries: Entry[]) {
  const active = entries.filter((item) => !item.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const header = ['frame', 'entry_id', 'lens', 'aperture', 'shift_profile', 'shift_x_mm', 'shift_y_mm', 'composition_started_at'];
  const rows = active.flatMap((entry, index) => frameSequence(entry.frameNumber, active[index + 1]?.frameNumber).map((frame) => [
    frame, entry.id, entry.lensName, entry.aperture, entry.shiftProfile ?? 'pico', entry.shiftX.toFixed(2), entry.shiftY.toFixed(2), entry.createdAt,
  ]));
  const csv = [header, ...rows].map((row) => row.map(quote).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `lens-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
