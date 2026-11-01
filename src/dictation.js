const speechErrors = {
  'not-allowed': 'Allow microphone access in your site settings and try again.',
  'audio-capture': 'Microphone unavailable. Check that it is connected.',
  'no-speech': 'No speech detected. Try again.',
  'language-not-supported': 'English speech recognition is unavailable in this browser.',
};

function keyboardHint() {
  return /Windows/i.test(navigator.userAgent)
    ? 'For system dictation, press Win + H in the message field.'
    : 'You can use keyboard dictation in the message field.';
}

export function bindDictation(button, prompt, notice, updateDraft) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let active = null;
  let started = false;
  let startupTimer;

  function showState(listening, message = '') {
    clearTimeout(startupTimer);
    const label = listening ? 'Stop dictation' : 'Dictate a message';
    button.setAttribute('aria-pressed', String(listening));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('.mic-label').textContent = listening ? 'Stop' : 'Dictate';
    notice.textContent = message;
  }
  function cancel() {
    const session = active;
    active = null;
    session?.abort();
    showState(false);
  }
  prompt.addEventListener('input', cancel);
  button.onclick = () => {
    if (active) {
      if (started) active.stop();
      else cancel();
      return;
    }
    if (!Recognition) {
      showState(false, 'Voice input is unavailable in this browser. ' + keyboardHint());
      prompt.focus();
      return;
    }
    const original = prompt.value;
    try {
      const session = new Recognition();
      active = session;
      started = false;
      session.lang = 'en-US';
      session.continuous = true;
      session.interimResults = true;
      session.onstart = () => {
        if (active !== session) return;
        started = true;
        showState(true, 'Listening… Select again to finish.');
      };
      session.onresult = event => {
        if (active !== session) return;
        const words = Array.from(event.results, result => result[0].transcript.trim()).filter(Boolean).join(' ');
        const space = words && original && !/\s$/.test(original) ? ' ' : '';
        const text = original + space + words;
        prompt.value = text.slice(0, prompt.maxLength);
        updateDraft();
        if (text.length > prompt.maxLength) {
          cancel();
          showState(false, 'Message length limit reached.');
        }
      };
      session.onerror = event => {
        if (active !== session) return;
        active = null;
        showState(false, event.error === 'aborted' ? '' : speechErrors[event.error] || 'Speech recognition is unavailable. ' + keyboardHint());
        if (document.activeElement === button) prompt.focus();
      };
      session.onend = () => {
        if (active !== session) return;
        active = null;
        showState(false);
        if (document.activeElement === button) prompt.focus();
      };
      showState(true, 'Connecting microphone…');
      startupTimer = setTimeout(() => {
        cancel();
        showState(false, 'The browser could not start the microphone. Check your recording permission. ' + keyboardHint());
        if (document.activeElement === button) prompt.focus();
      }, 15000);
      session.start();
    } catch (error) {
      active = null;
      showState(false, error.name === 'NotAllowedError' ? speechErrors['not-allowed'] : 'The microphone did not start. ' + keyboardHint());
      prompt.focus();
    }
  };
  return cancel;
}
