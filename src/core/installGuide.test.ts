import { describe, expect, it } from 'vitest';
import { ES } from './es';
import { installGuide } from './installGuide';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  iosFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  desktopEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
};

describe('installGuide', () => {
  it('gives each browser its own instructions', () => {
    const first = (ua: string, touchMac = false) => {
      const g = installGuide(ua, touchMac);
      return g.steps[0] ?? g.note;
    };
    expect(first(UA.iosSafari)).toContain('bar at the bottom');
    expect(first(UA.mac, true)).toBe(first(UA.iosSafari));
    expect(first(UA.mac)).toContain('File');
    expect(first(UA.iosChrome)).toContain('address bar');
    expect(first(UA.iosFirefox)).toContain('browser menu');
    expect(first(UA.androidChrome)).toContain('⋮');
    expect(first(UA.androidSamsung)).toContain('☰');
    expect(first(UA.androidFirefox)).toContain('next to the address bar');
    expect(first(UA.desktopEdge)).toContain('install icon');
    expect(installGuide(UA.desktopEdge).steps[1]).toContain('Apps');
    expect(installGuide(UA.desktopChrome).steps[1]).toContain('Install page as app');
    expect(installGuide(UA.desktopFirefox).steps).toEqual([]);
  });

  it('sends in-app browsers to a real browser', () => {
    expect(installGuide(UA.iosInstagram).note).toContain('Safari');
    expect(installGuide(UA.androidWebView).note).toContain('Chrome');
    expect(installGuide(UA.iosInstagram).copyLink).toBe(true);
  });

  it('has a Spanish translation for every string', () => {
    for (const ua of Object.values(UA)) {
      for (const touchMac of [false, true]) {
        const g = installGuide(ua, touchMac);
        for (const text of [...(g.note ? [g.note] : []), ...g.steps]) expect(ES[text], text).toBeTruthy();
      }
    }
  });
});
