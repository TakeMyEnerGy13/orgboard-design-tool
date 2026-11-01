const guide = document.getElementById('onboarding');
const steps = [...guide.querySelectorAll('.guide-step')];
const back = guide.querySelector('#guide-back');
const next = guide.querySelector('#guide-next');
const demo = guide.querySelector('.guide-demo');
const tryButton = demo.querySelector('#guide-try');
const faq = document.getElementById('faq-panel');
const faqButton = document.getElementById('open-faq');
const phone = guide.querySelector('.guide-phone');
const seenKey = 'orgboard.onboarding.v1';
let current = 0;

new IntersectionObserver(([entry]) => {
  if (entry.intersectionRatio >= .5) phone.classList.add('is-playing');
}, { root: guide.querySelector('.guide-pages'), threshold: .5 }).observe(phone);
phone.querySelector('.phone-replay').onclick = () => {
  phone.classList.add('is-playing');
  for (const animation of phone.getAnimations({ subtree: true })) {
    animation.currentTime = 0;
    animation.play();
  }
};

function showStep(index) {
  current = index;
  phone.classList.remove('is-playing');
  steps.forEach((step, i) => { step.hidden = i !== index; });
  const heading = steps[index].querySelector('h2');
  guide.setAttribute('aria-labelledby', heading.id);
  guide.querySelector('#guide-position').textContent = `Step ${index + 1} of ${steps.length}`;
  guide.style.setProperty('--progress', `${100 * (index + 1) / steps.length}%`);
  back.hidden = index === 0;
  next.textContent = index === steps.length - 1 ? 'Done' : 'Next';
  guide.querySelector('.guide-pages').scrollTop = 0;
  if (guide.open) heading.focus({ preventScroll: true });
}

function setExample(completed) {
  demo.classList.toggle('is-complete', completed);
  demo.querySelector('#guide-fact').textContent = completed ? '20' : '12';
  demo.querySelector('#guide-effect').textContent = completed
    ? 'Ethan met his target. This KPI no longer flags Olivia’s team.'
    : 'Ethan is below target. His manager has a team alert.';
  tryButton.textContent = completed ? 'Reset actual to 12' : 'Set actual to 20';
}

export function openGuide() {
  setExample(false);
  showStep(0);
  guide.showModal();
  steps[0].querySelector('h2').focus({ preventScroll: true });
}

export function showGuideOnFirstVisit() {
  try { if (localStorage.getItem(seenKey)) return; } catch {}
  openGuide();
}

function closeGuide() {
  try { localStorage.setItem(seenKey, 'seen'); } catch {}
  guide.close();
}

back.onclick = () => showStep(current - 1);
next.onclick = () => current === steps.length - 1 ? closeGuide() : showStep(current + 1);
tryButton.onclick = () => setExample(!demo.classList.contains('is-complete'));
guide.querySelector('#guide-skip').onclick = closeGuide;
guide.oncancel = event => {
  event.preventDefault();
  closeGuide();
};

faq.addEventListener('beforetoggle', event => {
  if (event.newState !== 'open') return;
  const topic = { metrics: 'results', goals: 'results', assistant: 'assistant' }[location.hash.slice(1)] || 'structure';
  faq.querySelector('#faq-' + topic).open = true;
});
document.getElementById('faq-guide').onclick = () => {
  faq.hidePopover();
  faqButton.focus({ preventScroll: true });
  openGuide();
};
