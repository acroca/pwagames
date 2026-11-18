import { t } from './i18n';
import { el } from './util';
import { installGuide } from './installGuide';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function initInstall() {
  const btn = document.querySelector<HTMLButtonElement>('#install-btn')!;
  const sheet = document.querySelector<HTMLDialogElement>('#install-sheet')!;
  const refresh = () => {
    btn.hidden = isInstalled();
  };
  refresh();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    btn.hidden = true;
    if (sheet.open) sheet.close();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', refresh);

  btn.addEventListener('click', async () => {
    if (deferred) {
      const ev = deferred;
      deferred = null;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') btn.hidden = true;
      return;
    }
    const guide = installGuide(navigator.userAgent, navigator.maxTouchPoints > 1);
    const body = el('div', 'sheet-body');
    body.append(el('h2', '', t('Install Logic Puzzles')));
    if (guide.note) body.append(el('p', 'install-note', t(guide.note)));
    if (guide.steps.length) {
      const list = el('ol', 'install-steps');
      for (const step of guide.steps) list.append(el('li', '', t(step)));
      body.append(list);
      if (!guide.redirect)
        body.append(el('p', 'install-note', t('The app then appears on your home screen, opens full-screen and works offline.')));
    }
    if (guide.copyLink && navigator.clipboard) {
      const copy = el('button', 'wide', t('Copy link'));
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.origin + location.pathname);
          copy.textContent = t('Link copied!');
        } catch {
          // Clipboard unavailable.
        }
      });
      body.append(copy);
    }
    const close = el('button', 'wide', t('Close'));
    close.type = 'button';
    close.addEventListener('click', () => sheet.close());
    body.append(close);
    sheet.replaceChildren(body);
    sheet.showModal();
  });
}

export function initShare() {
  const btn = document.querySelector<HTMLButtonElement>('#share-btn')!;
  const labelEl = document.querySelector<HTMLElement>('#share-label')!;
  btn.addEventListener('click', async () => {
    const data = { title: t('Logic Puzzles'), text: t('Play free logic puzzles with me!'), url: location.origin + location.pathname };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(data.url);
        const label = labelEl.textContent;
        labelEl.textContent = t('Link copied!');
        setTimeout(() => (labelEl.textContent = label), 2000);
      }
    } catch {
      // Share sheet dismissed or clipboard unavailable.
    }
  });
}
