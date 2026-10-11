// Take the share preview image: a screenshot of the top of the built page, as a visitor sees it
// when it opens, saved as dist/og.png. Run it after the build. It needs Chrome or Chromium
// (CHROME_BIN names another one); when it fails, dist/ keeps the copy of public/og.png.
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
// The size the page declares in its og:image tags.
const WIDTH = 1200;
const HEIGHT = 630;
const TIMEOUT = 60_000;
const BROWSERS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
const MAC_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function findBrowser() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const inPath = (process.env.PATH ?? '').split(delimiter)
    .flatMap((dir) => BROWSERS.map((name) => join(dir, name)));
  return [...inPath, ...MAC_BROWSERS].find((file) => existsSync(file));
}

// Chrome does not always exit after the screenshot, so the wait ends when the file is complete
// (it has stopped growing) and Chrome is then stopped.
function screenshot(browser, page, file, profileDir) {
  return new Promise((resolve, reject) => {
    const chrome = spawn(browser, [
      '--headless',
      '--hide-scrollbars',
      '--no-first-run',
      // The runner's sandbox does not start everywhere; the page is the site's own.
      ...(process.env.CI ? ['--no-sandbox'] : []),
      `--user-data-dir=${profileDir}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      '--force-device-scale-factor=1',
      // Lets the fonts load and the timeline animation settle before the shot.
      '--virtual-time-budget=5000',
      `--screenshot=${file}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore' });

    let size = 0;
    const finish = (error) => {
      clearInterval(poll);
      clearTimeout(timer);
      chrome.kill();
      if (error) reject(error);
      else resolve();
    };
    const poll = setInterval(() => {
      const now = existsSync(file) ? statSync(file).size : 0;
      if (now > 0 && now === size) finish();
      size = now;
    }, 250);
    const timer = setTimeout(() => finish(new Error('the browser took too long')), TIMEOUT);
    chrome.on('error', finish);
    chrome.on('exit', () => finish(existsSync(file) ? null : new Error('the browser made no screenshot')));
  });
}

async function main() {
  const page = join(DIST, 'index.html');
  if (!existsSync(page)) throw new Error('dist/index.html is missing, run "npm run build" first');
  const browser = findBrowser();
  if (!browser) throw new Error('Chrome was not found, set CHROME_BIN to its path');

  const work = await mkdtemp(join(tmpdir(), 'portfolio-og-'));
  try {
    const file = join(work, 'og.png');
    await screenshot(browser, page, file, join(work, 'profile'));
    // A PNG stores its width and height as two 32-bit numbers from byte 16.
    const png = await readFile(file);
    const size = `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`;
    if (size !== `${WIDTH}×${HEIGHT}`) throw new Error(`the screenshot is ${size}, not ${WIDTH}×${HEIGHT}`);
    await cp(file, join(DIST, 'og.png'));
  } finally {
    await rm(work, { recursive: true, force: true, maxRetries: 5 });
  }
}

try {
  await main();
  console.log('Updated dist/og.png.');
} catch (error) {
  console.error(`The share image was not updated: ${error.message}`);
  process.exitCode = 1;
}
