const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await c.newPage();
  for (const page of ['index','work','project-vellor','studio','director','contact','academy']) {
    await p.goto('http://127.0.0.1:8099/' + page + '.html');
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => ({
      h: document.documentElement.scrollHeight,
      scrollable: document.documentElement.scrollHeight - innerHeight,
    }));
    console.log(page.padEnd(16), 'height', String(m.h).padStart(6), ' scrollable', String(m.scrollable).padStart(6));
  }
  await b.close();
})();
