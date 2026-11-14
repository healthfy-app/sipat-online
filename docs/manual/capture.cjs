const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const root = 'C:/Users/laele/source/repos/SipatOnline';
const out = path.join(__dirname, 'shots');
fs.mkdirSync(out, { recursive: true });
const credentials = fs.readFileSync(path.join(root, '.docker-local-credentials.txt'), 'utf8');
const pick = (label) => new RegExp(label + ':\\s*(\\S+)\\s*/\\s*(\\S+)').exec(credentials);
const [, adminUser, adminPass] = pick('Administrador da empresa');
const [, opUser, opPass] = pick('Operador da plataforma');
const company = 'https://microsoft-demo.localhost:5188';
const ops = 'https://ops.localhost:5188';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let counter = 0;
async function shot(page, name, options = {}) {
  const file = path.join(out, `${String(++counter).padStart(2, '0')}-${name}.png`);
  try {
    await page.addStyleTag({ content: '.learning-demo-notice{display:none!important}' }).catch(() => {});
    if (options.selector) {
      const element = await page.$(options.selector);
      if (!element) throw new Error('selector not found ' + options.selector);
      await element.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: !!options.full });
    }
    console.log('ok', path.basename(file));
  } catch (error) {
    console.log('FAIL', name, error.message);
  }
}
async function login(page, base, user, pass) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=password]', { timeout: 30000 });
  const field = await page.$('input:not([type=password]):not([type=hidden])');
  await field.evaluate((el) => { el.focus(); el.select(); });
  await field.type(user);
  await page.type('input[type=password]', pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.keyboard.press('Enter'),
  ]);
  await wait(1500);
}
async function clickByText(page, selector, text) {
  const handles = await page.$$(selector);
  for (const handle of handles) {
    const content = await page.evaluate((el) => (el.getAttribute('aria-label') || '') + ' ' + el.textContent, handle);
    if (content.includes(text)) { await handle.click(); return true; }
  }
  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--no-first-run'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1.5 },
  });

  // ---------------- participant
  const learnerContext = await browser.createBrowserContext();
  const learner = await learnerContext.newPage();
  learner.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  await learner.goto(`${company}/login`, { waitUntil: 'domcontentloaded' });
  await learner.waitForSelector('input[type=password]', { timeout: 30000 });
  await wait(800);
  await shot(learner, 'login');
  await login(learner, company, 'maria.jose', '123456');
  await learner.goto(`${company}/learning`, { waitUntil: 'domcontentloaded' });
  await wait(2000);
  await shot(learner, 'learner-home');
  await learner.evaluate(() => window.scrollTo(0, 560));
  await wait(600);
  await shot(learner, 'learner-week-videos');
  await clickByText(learner, 'button.week-day-toggle', 'Recolher Dia 1');
  await wait(600);
  await shot(learner, 'learner-day-collapsed');
  await clickByText(learner, 'button.week-day-toggle', 'Abrir Dia 1');
  await wait(600);

  // the day page with the player
  await learner.evaluate(() => window.scrollTo(0, 0));
  const open = await learner.$('a.week-day-open');
  if (open) await open.click();
  await learner.waitForSelector('video', { timeout: 15000 }).catch(() => {});
  await wait(3000);
  await shot(learner, 'day-page');
  await learner.evaluate(async () => { const video = document.querySelector('video'); if (video) { video.muted = true; try { await video.play(); } catch {} } });
  await wait(1800);
  await learner.hover('.day-player').catch(() => {});
  await wait(500);
  await shot(learner, 'player-playing', { selector: '.day-stage' });
  await shot(learner, 'player-controls', { selector: '.day-player' });
  await learner.evaluate(() => document.querySelector('video')?.pause()).catch(() => {});
  await wait(800);
  await learner.goto(`${company}/learning/certificates`, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await shot(learner, 'learner-certificates');

  // mobile
  await learner.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await learner.goto(`${company}/learning`, { waitUntil: 'domcontentloaded' });
  await wait(2000);
  await shot(learner, 'mobile-home');
  const mobileOpen = await learner.$('a.week-day-open');
  if (mobileOpen) await mobileOpen.click();
  await learner.waitForSelector('video', { timeout: 15000 }).catch(() => {});
  await wait(3000);
  await shot(learner, 'mobile-day');
  await learnerContext.close();

  // ---------------- operator
  const opContext = await browser.createBrowserContext();
  const op = await opContext.newPage();
  await login(op, ops, opUser, opPass);
  await op.goto(`${ops}/platform`, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await shot(op, 'ops-companies');
  await clickByText(op, 'a', 'Abrir empresa Microsoft');
  await wait(2500);
  await shot(op, 'ops-company-sipats');
  const sipatCards = await op.$$('a[aria-label^="Abrir "]');
  if (sipatCards.length) { await sipatCards[0].click(); await wait(3500); await shot(op, 'ops-sipat-builder'); }
  await op.goto(`${ops}/platform/courses`, { waitUntil: 'domcontentloaded' });
  await wait(2000);
  await shot(op, 'ops-library');
  await clickByText(op, 'button', 'Gerenciar categorias');
  await wait(800);
  await shot(op, 'ops-categories-dialog', { selector: '[role=dialog]' });
  await op.keyboard.press('Escape');
  await wait(400);
  await clickByText(op, 'button', 'Criar assunto');
  await wait(800);
  await shot(op, 'ops-create-subject', { selector: '[role=dialog]' });
  await op.keyboard.press('Escape');
  await wait(400);
  await clickByText(op, 'button[role=tab]', 'Vídeos');
  await wait(2500);
  await shot(op, 'ops-library-videos');
  await clickByText(op, 'button[role=tab]', 'Planos');
  await wait(1500);
  await shot(op, 'ops-library-plans');
  await clickByText(op, 'button[role=tab]', 'Assuntos');
  await wait(1500);
  const card = await op.$('button[aria-label^="Abrir assunto"]');
  if (card) { await card.click(); await wait(3500); await shot(op, 'ops-course-editor'); }
  await opContext.close();

  // ---------------- company administrator
  const adminContext = await browser.createBrowserContext();
  const admin = await adminContext.newPage();
  await login(admin, company, adminUser, adminPass);
  await admin.goto(`${company}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  await wait(2000);
  await shot(admin, 'admin-overview');
  await admin.goto(`${company}/admin/sipats`, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await shot(admin, 'admin-sipats');
  await admin.goto(`${company}/admin/learning`, { waitUntil: 'domcontentloaded' });
  await wait(2000);
  await shot(admin, 'admin-collaborators');
  await adminContext.close();

  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
