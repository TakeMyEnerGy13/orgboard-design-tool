const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function picker({ id, name = id, label, value, options, identity = false, icon = '', disabled = false, emptyLabel = 'Not selected' }) {
  const selected = options.find(option => option.value === value) || options[0];
  const labelMarkup = `<span class="${identity ? 'identity-label' : 'picker-label'}" id="${id}-label">${esc(label)}</span>`;
  return `<div class="picker ${identity ? 'picker-identity' : 'field picker-field'}" data-picker>
    <input type="hidden" id="${id}" name="${name}" value="${esc(selected?.value ?? value)}">
    ${identity ? '' : labelMarkup}
    <button type="button" class="picker-trigger ${identity ? `field identity-field ${icon ? 'reporting-field' : 'identity-select'}` : ''}" id="${id}-trigger" role="combobox" aria-labelledby="${id}-label" aria-describedby="${id}-current" aria-haspopup="listbox" aria-controls="${id}-menu" aria-expanded="false" ${disabled ? 'disabled' : ''}>
      ${icon ? `<span class="reporting-icon" aria-hidden="true">${icon}</span>` : ''}<span class="picker-value ${identity ? 'identity-value' : ''}">${identity ? labelMarkup : ''}<span class="picker-current" id="${id}-current">${esc(selected?.title || emptyLabel)}</span></span><svg class="picker-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg>
    </button>
    <div class="picker-menu" id="${id}-menu" popover="auto" role="listbox" aria-labelledby="${id}-label">${options.map(option => `<div class="picker-option ${option.description ? '' : 'picker-option-compact'}" id="${id}-option-${esc(option.value)}" role="option" aria-selected="${option === selected}" data-picker-option="${esc(option.value)}">${option.initials || option.icon ? `<span class="picker-avatar" aria-hidden="true">${option.icon || esc(option.initials)}</span>` : ''}<span class="picker-option-info"><span class="picker-option-title">${esc(option.title)}</span>${option.description ? `<span class="picker-option-description">${esc(option.description)}</span>` : ''}</span><svg class="picker-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7"/></svg></div>`).join('')}</div>
  </div>`;
}

export function mountPickers(scope, { constrainToScope = false } = {}) {
  const dismiss = [...scope.querySelectorAll('[data-picker]')].map(element => mountPicker(element, scope, constrainToScope));
  return () => dismiss.forEach(close => close());
}

function mountPicker(element, scope, constrainToScope) {
  const trigger = element.querySelector('.picker-trigger');
  const menu = element.querySelector('.picker-menu');
  const field = element.querySelector('input[type="hidden"]');
  const current = element.querySelector('.picker-current');
  const options = [...menu.querySelectorAll('[data-picker-option]')];
  let active = 0, openEvents, search = '', lastTyped = 0;
  const isOpen = () => menu.matches(':popover-open');

  function reset() {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    openEvents?.abort();
    search = '';
  }
  function close() {
    if (isOpen()) menu.hidePopover();
    reset();
  }
  function highlight(index) {
    active = Math.max(0, Math.min(options.length - 1, index));
    options.forEach((option, i) => option.classList.toggle('is-active', i === active));
    trigger.setAttribute('aria-activedescendant', options[active].id);
    const item = options[active].getBoundingClientRect(), bounds = menu.getBoundingClientRect();
    if (item.top < bounds.top + 8) menu.scrollTop += item.top - bounds.top - 8;
    else if (item.bottom > bounds.bottom - 8) menu.scrollTop += item.bottom - bounds.bottom + 8;
  }
  function open() {
    if (trigger.matches(':disabled') || !options.length || isOpen()) return;
    const boundsElement = element.closest('.editor-content') || scope;
    const anchor = trigger.getBoundingClientRect(), boundary = constrainToScope ? boundsElement.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const edge = 12, gap = 8, top = Math.max(edge, boundary.top + edge), bottom = Math.min(innerHeight - edge, boundary.bottom - edge);
    const below = bottom - anchor.bottom - gap, above = anchor.top - top - gap;
    const minWidth = menu.querySelector('.picker-option-compact') ? 220 : anchor.width;
    menu.style.width = `${Math.min(Math.max(anchor.width, minWidth), innerWidth - edge * 2)}px`;
    menu.style.maxHeight = '380px';
    menu.showPopover();
    const desired = Math.min(menu.scrollHeight + 2, 380), upwards = below < desired && above > below;
    menu.style.maxHeight = `${Math.max(0, Math.min(380, upwards ? above : below))}px`;
    menu.style.left = `${Math.max(edge, Math.min(anchor.left, innerWidth - menu.offsetWidth - edge))}px`;
    menu.style.top = `${upwards ? anchor.top - gap - menu.offsetHeight : anchor.bottom + gap}px`;
    menu.dataset.side = upwards ? 'above' : 'below';
    trigger.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, options.findIndex(option => option.dataset.pickerOption === field.value)));
    openEvents = new AbortController();
    const content = element.closest('.editor-content') || scope, initialScroll = content.scrollTop;
    const initialWidth = innerWidth, initialHeight = innerHeight;
    content.addEventListener('scroll', () => { if (content.scrollTop !== initialScroll) close(); }, { signal: openEvents.signal });
    window.addEventListener('resize', () => { if (innerWidth !== initialWidth || innerHeight !== initialHeight) close(); }, { signal: openEvents.signal });
  }
  function choose(index) {
    const option = options[index];
    if (field.value !== option.dataset.pickerOption) {
      field.value = option.dataset.pickerOption;
      current.textContent = option.querySelector('.picker-option-title').textContent;
      options.forEach(item => item.setAttribute('aria-selected', String(item === option)));
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    close();
  }

  trigger.onclick = () => isOpen() ? close() : open();
  trigger.onkeydown = event => {
    const { key } = event;
    if (key === 'Escape' && isOpen()) {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    if (key === 'Tab') { if (isOpen()) choose(active); return; }
    if (event.ctrlKey || event.metaKey) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault();
      const wasOpen = isOpen();
      if (!wasOpen) open();
      if (key === 'Home') highlight(0);
      else if (key === 'End') highlight(options.length - 1);
      else if (wasOpen && (key === 'Enter' || key === ' ' || (key === 'ArrowUp' && event.altKey))) choose(active);
      else if (wasOpen && (key === 'ArrowDown' || key === 'ArrowUp')) highlight(active + (key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (key.length === 1 && !event.altKey) {
      event.preventDefault();
      open();
      const now = Date.now();
      search = now - lastTyped > 700 ? key : search + key;
      lastTyped = now;
      const term = [...search].every(letter => letter === key) ? key : search;
      const ordered = options.map((_, i) => (active + (term.length === 1 ? 1 : 0) + i) % options.length);
      const match = ordered.find(i => ['.picker-option-title', '.picker-option-description'].some(selector => options[i].querySelector(selector)?.textContent.toLocaleLowerCase('en').startsWith(term.toLocaleLowerCase('en'))));
      if (match !== undefined) highlight(match);
    }
  };
  options.forEach((option, index) => {
    option.onpointerdown = event => event.preventDefault();
    option.onpointermove = event => { if (event.pointerType === 'mouse') highlight(index); };
    option.onclick = () => { choose(index); trigger.focus({ preventScroll: true }); };
  });
  menu.addEventListener('toggle', () => { if (!isOpen()) reset(); });
  trigger.onblur = () => { if (isOpen()) close(); };
  return close;
}
