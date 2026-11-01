import { metricStatus } from './domain.js';
import { metricStatusText } from './locale.js';
import { editableField, readout, statusBadge } from './ui.js';
import { picker, mountPickers } from './picker.js';

const $ = selector => document.querySelector(selector);
const initial = { name: 'Video ads delivered', current: 12, target: 20, unit: 'videos', direction: 'higher' };
const example = $('#example'), dialog = $('#dialog'), form = $('#sample-form');
let metric = { ...initial }, view = 'result', dismissPicker = () => {};
const say = text => { $('#feedback').textContent = text; };
$('#statuses').innerHTML = ['met', 'below', 'missing', 'vacant'].map(status => statusBadge(status)).join('');

function render() {
  dismissPicker();
  const status = metricStatus(metric);
  example.dataset.status = status;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $('#clear-fact').disabled = metric.current === null;
  example.innerHTML = `<div class="kit-example-head"><h3>${initial.name}</h3>${statusBadge(status, '', metricStatusText(status, metric))}</div>`;
  if (view === 'result') {
    example.insertAdjacentHTML('beforeend', readout(metric, true, 'aria-label="Edit sample actual"'));
    example.querySelector('.fact-value').onclick = () => openDialog('edit');
    return;
  }
  example.insertAdjacentHTML('beforeend', `<form class="kit-settings">
    ${editableField('Target value', 'target', metric.target, { type: 'number', required: true })}
    ${picker({ id: 'direction', label: 'Better when', value: metric.direction, identity: true, options: [{ value: 'higher', title: 'Higher' }, { value: 'lower', title: 'Lower' }] })}
    <button class="button primary" type="submit" disabled>Save plan</button></form>`);
  dismissPicker = mountPickers(example);
  const plan = example.querySelector('form'), save = plan.querySelector('[type="submit"]');
  const { target, direction } = plan.elements;
  plan.oninput = () => { save.disabled = !target.validity.valid || (target.valueAsNumber === metric.target && direction.value === metric.direction); };
  plan.onsubmit = event => {
    event.preventDefault();
    if (save.disabled) return;
    metric = { ...metric, target: target.valueAsNumber, direction: direction.value };
    showResult(); say('Sample plan saved.');
  };
}
function showResult() {
  view = 'result'; render(); $('[data-view="result"]').focus({ preventScroll: true });
}
function openDialog(mode) {
  const remove = mode === 'clear', submit = $('#submit-dialog');
  $('#dialog-title').textContent = remove ? 'Clear the sample actual?' : 'Edit actual';
  dialog.querySelector('.dialog-body').innerHTML = remove ? '<p>The target will be kept and the metric will show Missing data.</p>' : editableField('Video ads delivered, videos', 'current', metric.current, { type: 'number', required: true });
  submit.className = 'button ' + (remove ? 'danger' : 'primary');
  submit.textContent = remove ? 'Delete' : 'Save';
  submit.disabled = !remove;
  form.oninput = () => {
    const field = form.elements.current;
    if (field) submit.disabled = !field.validity.valid || field.valueAsNumber === metric.current;
  };
  form.onsubmit = event => {
    event.preventDefault();
    if (submit.disabled) return;
    metric = { ...metric, current: remove ? null : form.elements.current.valueAsNumber };
    dialog.close(); showResult(); say(remove ? 'Sample actual cleared.' : 'Sample actual saved.');
  };
  dialog.showModal();
  if (remove) $('#cancel-dialog').focus(); else form.elements.current.select();
}
document.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { view = b.dataset.view; render(); }; });
$('#edit-fact').onclick = () => openDialog('edit');
$('#clear-fact').onclick = () => openDialog('clear');
$('#cancel-dialog').onclick = () => dialog.close();
$('#open-plan').onclick = () => { view = 'plan'; render(); example.querySelector('[name="target"]').focus(); };
$('#restore').onclick = () => { metric = { ...initial }; view = 'result'; render(); say('Original values restored.'); };
render();
