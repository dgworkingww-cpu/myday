const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = process.cwd();
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png' };
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/,'');
  const file = path.resolve(root,relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root,'index.html')) { res.writeHead(403).end(); return; }
  fs.readFile(file,(err,data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(4173,'127.0.0.1',resolve));
  const browserType = process.env.BROWSER === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  const page = await context.newPage();
  const pageErrors=[],consoleErrors=[],failedRequests=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  page.on('requestfailed',r=>failedRequests.push(r.url()+': '+(r.failure()?.errorText||'failed')));
  await page.route('https://telegram.org/**',route=>route.fulfill({
    status:200,contentType:'application/javascript',
    body:'window.Telegram={WebApp:{ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},onEvent(){}}};'
  }));
  try {
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(500);
    if(!(await page.locator('#app .page-title').count())){
      const state=await page.evaluate(()=>({ready:document.readyState,app:document.querySelector('#app')?.innerHTML.slice(0,1200),nav:document.querySelector('#nav')?.innerHTML,appleLoaded:window.MYDAY_APPLE_UI_PENDING===false,body:document.body.innerText.slice(0,500)})).catch(e=>({evaluateError:e.message}));
      throw new Error('Initial MYDAY screen did not render ('+(process.env.BROWSER||'chromium')+'): '+JSON.stringify({pageErrors,consoleErrors,state}));
    }
    await page.locator('#app .page-title').waitFor({timeout:5000});
    await page.locator('#app .hero-card').waitFor({timeout:5000});
    if(await page.locator('#nav button svg').count()!==5) throw new Error('New SVG navigation icons did not render');
    await page.waitForTimeout(150);
    const widths=[320,360,375,390,393,414,430],layout=[];
    for (const width of widths) {
      await page.setViewportSize({width,height:844});
      await page.waitForTimeout(40);
      const m=await page.evaluate(()=>({
        viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,
        appRight:Math.round(document.querySelector('#app').getBoundingClientRect().right),
        navLeft:Math.round(document.querySelector('#nav').getBoundingClientRect().left),
        navRight:Math.round(document.querySelector('#nav').getBoundingClientRect().right),
        navHeight:Math.round(document.querySelector('#nav').getBoundingClientRect().height),
        navWidth:Math.round(document.querySelector('#nav').getBoundingClientRect().width),
        navRadius:parseFloat(getComputedStyle(document.querySelector('#nav')).borderBottomLeftRadius)
      }));
      layout.push(m);
      if(m.document>width || m.body>width) throw new Error('Horizontal overflow at '+width+'px: '+JSON.stringify(m));
      if(m.navLeft<8 || m.navRight>width-8 || m.navWidth>width-16 || m.navHeight<48 || m.navRadius<16) throw new Error('Floating navigation is not inset or pill-shaped at '+width+'px: '+JSON.stringify(m));
    }
    await page.setViewportSize({width:390,height:844});
    const nav=page.locator('#nav button');
    if(await nav.count()!==5) throw new Error('Expected five navigation tabs');
    const screens=[];
    for(let i=0;i<5;i++){await nav.nth(i).click();await page.locator('#app .page-title').waitFor();screens.push(await page.locator('#app .page-title').first().innerText());}
    if(!screens[1].includes('Расписание') || !screens[2].includes('Задачи') || !screens[3].includes('Учёба') || !screens[4].includes('Настройки')) throw new Error('Unexpected screen navigation: '+screens.join(' | '));

    // Exercise the rebuilt secondary screens from the More tab.
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/Календарь/}).click();
    await page.locator('.calendar-grid').nth(1).waitFor();
    if(!(await page.locator('#app .page-title').innerText()).includes('Календарь')) throw new Error('Calendar screen did not open');
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/План недели/}).click();
    await page.locator('.week-list').waitFor();
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/Статистика/}).click();
    await page.locator('.stats-bars').waitFor();
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/Университет/}).click();
    await page.locator('#u1').waitFor();
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/Идеи и заметки/}).click();
    await page.locator('#app .page-title').waitFor();
    await page.locator('#nav button').nth(4).click();

    const themeButtons=page.locator('.theme-options button');
    if(await themeButtons.count()!==3) throw new Error('Expected Light, Dark and System theme controls');
    await themeButtons.nth(0).click();
    if(await page.locator('html').getAttribute('data-theme')!=='light') throw new Error('Light theme did not apply');
    await themeButtons.nth(1).click();
    if(await page.locator('html').getAttribute('data-theme')!=='dark') throw new Error('Dark theme did not apply');
    await themeButtons.nth(2).click();

    await page.locator('#nav button').nth(0).click();
    await page.locator('button[aria-label="Быстрое добавление"]').click();
    const sheet=page.locator('#ov .sheet');
    await sheet.waitFor();
    await page.waitForTimeout(260);
    const sheetBounds=await sheet.boundingBox();
    const vh=await page.evaluate(()=>innerHeight);
    if(!sheetBounds || sheetBounds.x<0 || sheetBounds.x+sheetBounds.width>390 || sheetBounds.y+sheetBounds.height>vh+1) throw new Error('Quick capture sheet exceeds phone viewport: '+JSON.stringify({sheetBounds,vh}));
    await page.locator('#ov .sheet-close').click();
    await page.locator('.ov').waitFor({state:'detached'});

    // Arbitrary text is captured as an inbox note by default, without forcing a task category.
    await page.locator('button[aria-label="Быстрая запись"]').click();
    await page.locator('#ov #cq').waitFor();
    await page.locator('#ov #cq').fill('MYDAY freeform note with a link https://example.com');
    const captureDefault=await page.locator('#ov #capture-kind').inputValue();
    if(captureDefault!=='i') throw new Error('Freeform capture must default to the inbox; got '+JSON.stringify(captureDefault));
    await page.getByRole('button',{name:'Сохранить'}).click();
    await page.locator('.ov').waitFor({state:'detached'});
    const inboxText=await page.evaluate(()=>JSON.parse(localStorage.getItem('myday2')).inbox[0].text);
    if(inboxText!=='MYDAY freeform note with a link https://example.com') throw new Error('Freeform text was not preserved in the inbox');

    // Search must find the note and let the user promote it to a task.
    await page.evaluate(()=>search());
    await page.locator('#ov #sq').fill('MYDAY freeform note');
    await page.getByRole('button',{name:/MYDAY freeform note/}).waitFor();
    await page.getByRole('button',{name:/MYDAY freeform note/}).click();
    await page.getByText('MYDAY freeform note with a link https://example.com',{exact:true}).waitFor();

    // Search events by date/time as well as title, and open the event details.
    await page.evaluate(()=>{
      const d='2026-12-09';
      S.events.push({title:'MYDAY searchable event',date:d,time:'14:30',note:'Event detail smoke'});
      save();
      search();
    });
    await page.locator('#ov #sq').fill('14:30');
    await page.getByRole('button',{name:/MYDAY searchable event/}).waitFor();
    await page.getByRole('button',{name:/MYDAY searchable event/}).click();
    await page.getByText('Event detail smoke',{exact:true}).waitFor();
    await page.locator('#ov .sheet-close').click();
    await page.locator('.ov').waitFor({state:'detached'});

    await page.locator('#nav button').nth(2).click();
    await page.getByRole('button',{name:/Новая задача/}).click();
    await sheet.waitFor();
    await page.waitForTimeout(260);
    const taskBounds=await sheet.boundingBox();
    if(!taskBounds || taskBounds.x<0 || taskBounds.x+taskBounds.width>390 || taskBounds.y+taskBounds.height>vh+1) throw new Error('Task editor sheet exceeds phone viewport: '+JSON.stringify({taskBounds,vh}));
    await page.locator('#ov #f1').fill('MYDAY UI smoke task');
    await page.getByRole('button',{name:'Сохранить'}).click();
    await page.locator('.ov').waitFor({state:'detached'});
    await page.getByText('MYDAY UI smoke task',{exact:true}).waitFor();

    await page.locator('#nav button').nth(1).click();
    await page.getByRole('button',{name:'Добавить',exact:true}).click();
    await page.locator('#ov #f1').fill('MYDAY UI smoke class');
    await page.locator('#ov #f2').fill('09:00');
    await page.locator('#ov #f3').fill('10:00');
    await page.getByRole('button',{name:'Сохранить'}).click();
    await page.locator('.ov').waitFor({state:'detached'});
    await page.getByText('MYDAY UI smoke class',{exact:true}).waitFor();

    // Exercise the day -> night -> recovery -> off work rotation.
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/Сменный график/}).click();
    await page.locator('#work-mode').selectOption('rotation');
    await page.locator('#work-pattern').fill('ДНОВ');
    await page.locator('#work-anchor').fill('2026-11-28');
    await page.locator('#work-day-start').fill('08:00');
    await page.locator('#work-day-end').fill('20:00');
    await page.locator('#work-night-start').fill('20:00');
    await page.locator('#work-night-end').fill('08:00');
    await page.getByRole('button',{name:'Сохранить цикл'}).click();
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/Сменный график/}).click();
    await page.getByRole('button',{name:/Открыть рабочий план/}).click();
    await page.evaluate(()=>MYDAY_LAB.selectWorkDate('2026-11-28'));
    await page.locator('.work-shift-card b').filter({hasText:'Дневная смена'}).waitFor();
    await page.locator('.work-shift-card strong').filter({hasText:'08:00–20:00'}).waitFor();
    await page.evaluate(()=>MYDAY_LAB.selectWorkDate('2026-11-29'));
    await page.locator('.work-shift-card b').filter({hasText:'Ночная смена'}).waitFor();
    await page.locator('.work-shift-card strong').filter({hasText:'20:00–08:00'}).waitFor();
    await page.evaluate(()=>MYDAY_LAB.selectWorkDate('2026-11-30'));
    await page.locator('.work-shift-card b').filter({hasText:'Отсыпной'}).waitFor();
    await page.evaluate(()=>MYDAY_LAB.selectWorkDate('2026-12-01'));
    await page.locator('.empty-state b').filter({hasText:'Выходной'}).first().waitFor();

    if(pageErrors.length) throw new Error('Page errors: '+pageErrors.join(' | '));
    if(consoleErrors.length) throw new Error('Console errors: '+consoleErrors.join(' | '));
    if(failedRequests.length) throw new Error('Failed requests: '+failedRequests.join(' | '));
    console.log(JSON.stringify({result:'passed',viewport:'390x844',testedWidths:widths,layout,screens,themes:['light','dark','system'],dialogs:['quick capture','task editor'],pageErrors,consoleErrors,failedRequests},null,2));
  } finally { await context.close(); await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
