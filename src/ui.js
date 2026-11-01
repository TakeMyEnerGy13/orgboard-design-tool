import { metricStatus } from './domain.js';
import { statusText } from './locale.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const number = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) : '—';
export const editValueIcon = '<svg class="edit-value-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3 3 3M3 10l7-7a2.1 2.1 0 0 1 3 3l-7 7-4 1 1-4Z"/></svg>';

function metricNote(metric, employee = true) {
  if (!employee) return 'Assign an employee to assess this role';
  if (metricStatus(metric) === 'missing') return 'The target or actual is missing';
  const delta = metric.current - metric.target, unit = metric.unit ? ` ${metric.unit}` : '';
  if (!delta) return 'Exactly on target';
  if (metric.direction === 'lower') return delta > 0 ? `Over the limit by ${number(delta)}${unit}` : `Under the limit by ${number(-delta)}${unit}`;
  return delta < 0 ? `Remaining to target: ${number(-delta)}${unit}` : `Above target by ${number(delta)}${unit}`;
}
export function statusIcon(status) {
  const paths = {
    met: '<path d="m3.5 8 3 3 6-6"/>',
    below: '<path d="m4 4 8 8m0-7v7H5"/>',
    missing: '<path d="M4 8h8"/>',
    vacant: '<circle cx="6" cy="5" r="2.5"/><path d="M1.5 13v-1a4.5 4.5 0 0 1 7-3.7M12 8v6m-3-3h6"/>',
    team: '<path d="M8 5v3M3 11V8h10v3"/><circle cx="8" cy="3" r="2"/><circle cx="3" cy="13" r="2"/><circle cx="13" cy="13" r="2"/>',
  };
  return `<svg class="status-icon" data-status-icon="${status}" viewBox="0 0 16 16" aria-hidden="true">${paths[status]}</svg>`;
}
export function statusContent(status, label = statusText[status]) {
  return `${statusIcon(status)}<span>${esc(label)}</span>`;
}
export function statusBadge(status, id = '', label = statusText[status]) {
  return `<span ${id ? `id="${id}"` : ''} class="status-badge ${status}">${statusContent(status, label)}</span>`;
}
export function metricProgress(metric, employee = true) {
  const lower = metric.direction === 'lower', targetLabel = lower ? 'Limit' : 'Target';
  const ready = employee && metricStatus(metric) !== 'missing' && metric.current >= 0 && metric.target >= 0;
  const heading = lower ? 'Limit used' : 'Target attainment';
  if (!ready) {
    const missing = [!metric.name?.trim() && 'metric name', !Number.isFinite(metric.target) && 'target', !Number.isFinite(metric.current) && 'actual'].filter(Boolean);
    const vacancyNote = Number.isFinite(metric.current) ? 'An actual is recorded. Assign an employee to assess it.' : 'Waiting for an employee';
    const message = employee ? `Add ${(missing.length === 2 ? missing.join(' and ') : missing.join(', ')) || 'valid values'}` : vacancyNote;
    return `<div class="metric-progress is-empty" role="img" aria-label="${message}"><div class="progress-heading"><span>${heading}</span><strong>—</strong></div><div class="progress-empty">${message}</div></div>`;
  }
  const scale = (Math.max(metric.current, metric.target) || 1) * 1.25;
  const actual = metric.current / scale * 100, target = metric.target / scale * 100;
  const percent = metric.target > 0 ? `${number(metric.current / metric.target * 100)}%` : null;
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const description = `Actual: ${number(metric.current)}${unit}. ${targetLabel}: ${number(metric.target)}${unit}. ${metricNote(metric)}`;
  return `<div class="metric-progress" role="img" aria-label="${esc(description)}" style="--actual-position:${actual}%;--target-position:${target}%"><div class="progress-heading"><span>${percent ? heading : `${targetLabel} — 0`}</span><strong>${esc(percent || `${number(metric.current)}${unit}`)}</strong></div><div class="progress-plot" aria-hidden="true"><div class="progress-overflow"></div><div class="progress-rail"><span class="progress-fill"></span></div><span class="progress-target"></span><span class="progress-actual"></span></div></div>`;
}
export function readout(metric, employee = true, edit = '') {
  const status = employee ? metricStatus(metric) : 'vacant';
  return `<div class="metric-readout" data-status="${status}"><div class="metric-pair"><div><span class="value-label">Actual${metric.unit ? `, ${esc(metric.unit)}` : ''}</span>${edit ? `<button type="button" class="fact-value" ${edit}><strong>${number(metric.current)}</strong>${editValueIcon}</button>` : `<strong>${number(metric.current)}</strong>`}</div><div><span class="value-label">Target${metric.direction === 'lower' ? ' ≤' : ''}${metric.unit ? `, ${esc(metric.unit)}` : ''}</span><strong>${number(metric.target)}</strong></div></div>${metricProgress(metric, employee)}</div>`;
}

export const fieldPencil = '<svg class="identity-pencil" viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4 4 4M4 12l9-9a2.8 2.8 0 0 1 4 4l-9 9-5 1 1-5Z"/></svg>';
export function editableField(label, name, value, { type = 'text', required = false, placeholder = '', multiline = false, className = '' } = {}) {
  const attributes = `name="${name}" ${required ? 'required' : ''} placeholder="${esc(placeholder)}"`;
  const control = multiline
    ? `<textarea ${attributes} rows="2" maxlength="500">${esc(value)}</textarea>`
    : `<input ${attributes} type="${type}" value="${esc(value)}" ${type === 'number' ? 'min="0" step="any" inputmode="decimal"' : 'maxlength="180"'}>`;
  return `<label class="field identity-field ${className}"><span class="identity-label">${label}</span><span class="identity-control">${control}${fieldPencil}</span></label>`;
}
