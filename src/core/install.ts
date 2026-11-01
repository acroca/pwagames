import { t } from './i18n';
import { el } from './util';

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

function instructions(): string {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return 'In Safari, tap the Share button, then choose “Add to Home Screen”.';
  if (/Android/.test(ua)) return 'In your browser menu (⋮), choose “Install app” or “Add to Home screen”.';
  return 'In your browser, look for the install icon in the address bar, or open the menu and choose “Install”.';
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
    const body = el('div', 'sheet-body');
    const close = el('button', 'wide', t('Close'));
    close.type = 'button';
    close.addEventListener('click', () => sheet.close());
    body.append(el('h2', '', t('Install Logic Puzzles')), el('p', '', t(instructions())), close);
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
