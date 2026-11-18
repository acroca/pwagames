/** Manual install instructions for one browser, as English source strings for `t()`. */
export interface InstallGuide {
  /** Shown above the steps: what to expect, or why installing isn't possible here. */
  note?: string;
  steps: string[];
  /** Offer a "Copy link" button, for browsers the page has to be reopened elsewhere from. */
  copyLink?: boolean;
  /** The steps lead to another browser instead of installing the app. */
  redirect?: boolean;
}

const IOS_ADD = 'Scroll down the list and tap “Add to Home Screen”.';
const IOS_CONFIRM = 'Tap “Add” in the top corner.';
const ANDROID_CONFIRM = 'Tap “Install” or “Add” to confirm.';

/**
 * Picks the instructions for the browser described by `ua`. `touchMac` tells an
 * iPad apart from a Mac, since iPadOS Safari sends a Mac user agent.
 */
export function installGuide(ua: string, touchMac = false): InstallGuide {
  const ios = /iPad|iPhone|iPod/.test(ua) || (touchMac && /Macintosh/.test(ua));
  const android = /Android/.test(ua);
  // Browsers embedded in other apps (Instagram, Facebook, TikTok…) can't install anything.
  const inApp =
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Twitter|Snapchat|Pinterest|LinkedInApp|WhatsApp|Telegram|GSA\//.test(ua) ||
    (android && /; wv\)/.test(ua));

  if (inApp) {
    return {
      note: ios
        ? 'This page is open inside another app, which can’t install it. Open it in Safari first:'
        : 'This page is open inside another app, which can’t install it. Open it in Chrome first:',
      steps: [
        'Tap the menu (⋯ or ⋮), usually in a top corner.',
        ios ? 'Choose “Open in Safari” or “Open in browser”.' : 'Choose “Open in Chrome” or “Open in browser”.',
        'There, tap “Install app” again.',
      ],
      copyLink: true,
      redirect: true,
    };
  }

  if (ios) {
    if (/CriOS/.test(ua)) {
      return {
        steps: ['Tap the Share button at the right end of the address bar (a square with an arrow pointing up).', IOS_ADD, IOS_CONFIRM],
      };
    }
    if (/FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave/.test(ua)) {
      return {
        note: 'If your browser doesn’t show these options, open this page in Safari.',
        steps: ['Open the browser menu (☰ or ⋯) and tap “Share”.', IOS_ADD, IOS_CONFIRM],
        copyLink: true,
      };
    }
    return {
      steps: [
        'Tap the Share button (a square with an arrow pointing up). It’s in the bar at the bottom of the screen, or at the top on iPad. If you don’t see it, tap ⋯ first, then “Share”.',
        IOS_ADD,
        IOS_CONFIRM,
      ],
    };
  }

  if (android) {
    if (/SamsungBrowser/.test(ua)) {
      return {
        steps: ['Tap the menu (☰) in the bottom corner.', 'Tap “Add to” (or “Add page to”), then “Home screen”.', ANDROID_CONFIRM],
      };
    }
    if (/Firefox/.test(ua)) {
      return {
        steps: ['Tap the menu (⋮) next to the address bar.', 'Tap “Add app to Home screen” (or “Install”).', ANDROID_CONFIRM],
      };
    }
    return {
      steps: [
        'Tap the menu (⋮) in the top corner of the browser.',
        'Tap “Add to Home screen” (or “Install app”).',
        ANDROID_CONFIRM,
      ],
    };
  }

  if (/Firefox/.test(ua)) {
    return {
      note: 'Firefox can’t install apps on most computers. Open this page in Chrome or Edge and press “Install app” there.',
      steps: [],
      copyLink: true,
    };
  }
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) {
    return {
      steps: ['In the menu bar at the top of the screen, open “File”.', 'Choose “Add to Dock”.', 'Click “Add”.'],
    };
  }
  if (/Edg\//.test(ua)) {
    return {
      steps: [
        'Click the install icon at the right end of the address bar.',
        'If it isn’t there, open the menu (⋯), then “Apps”, then “Install this site as an app”.',
        'Click “Install”.',
      ],
    };
  }
  return {
    steps: [
      'Click the install icon at the right end of the address bar.',
      'If it isn’t there, open the browser menu (⋮), then “Cast, save, and share”, then “Install page as app”.',
      'Click “Install”.',
    ],
  };
}
