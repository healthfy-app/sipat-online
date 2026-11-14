const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, 'manual.html')).href, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.evaluateHandle('document.fonts.ready');
  await page.pdf({
    path: path.join(__dirname, 'SIPAT-Online-Manual.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#5a6b65;padding:0 15mm;display:flex;justify-content:space-between;font-family:Arial"><span>SIPAT Online · Manual do usuário · ambiente de demonstração fictício</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  await browser.close();
  console.log('pdf ok');
})();
