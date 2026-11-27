const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = process.cwd();
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png' };
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root,relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(err,data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(data);
  });
});

function makePdf(lines) {
  const pageCount = lines.length, fontId = 3 + pageCount * 2, objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [' + lines.map((_,i)=>(3+i*2)+' 0 R').join(' ') + '] /Count ' + pageCount + ' >>';
  lines.forEach((line,i) => {
    const pageId=3+i*2, contentId=pageId+1;
    objects[pageId]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Resources << /Font << /F1 '+fontId+' 0 R >> >> /Contents '+contentId+' 0 R >>';
    const stream='BT /F1 20 Tf 40 180 Td ('+line+') Tj ET';
    objects[contentId]='<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream';
  });
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf='%PDF-1.4\n%MYDAY\n', offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(pdf);pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n'}
  const xref=Buffer.byteLength(pdf);pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return Buffer.from(pdf,'binary');
}

(async () => {
  await new Promise(resolve => server.listen(4174,'127.0.0.1',resolve));
  const browserType=process.env.BROWSER==='webkit'?webkit:chromium;
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  page.setDefaultTimeout(120000);
  const errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>failed.push(r.url()+': '+(r.failure()?.errorText||'failed')));
  await page.route('https://telegram.org/**',route=>route.fulfill({
    status:200,contentType:'application/javascript',
    body:'window.Telegram={WebApp:{initData:"test-init-data",initDataUnsafe:{user:{id:12345}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},onEvent(){},showAlert(){},close(){}}};'
  }));
  await page.route('https://rzgsctbvgzerqizfjhuq.supabase.co/functions/v1/myday-document-analyze',async route=>{
    const body=route.request().postDataJSON();
    if(failAnalyze) return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Тестовая ошибка ИИ',code:'AI_PROVIDER_ERROR'})});
    if(!body.text || !body.text.includes('MYDAY PDF PAGE ONE')) return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'Test text missing'})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,analysis:{
      documentType:'Учебный документ',title:'Тестовый документ',summary:'Проверка сквозного сценария MYDAY.',
      keyPoints:['В документе две страницы.'],warnings:[],
      proposals:{tasks:[{title:'Проверочная задача',description:'Из PDF',dueDate:null,priority:'medium',category:'Учёба'}],
        homework:[],events:[{title:'Проверочное событие',date:'2026-12-01',time:'12:00',endTime:'13:00',type:'Учёба'}],schedule:[{weekday:1,start:'09:00',end:'10:00',subject:'Конфликтующая пара',room:'',teacher:'',weekType:'odd',confidence:0.99}]}
    }})});
  });
  let savedProfile=null,failAnalyze=false;
  await page.route('https://rzgsctbvgzerqizfjhuq.supabase.co/functions/v1/myday-sync',async route=>{
    const body=route.request().postDataJSON();
    if(body.action==='load') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{tasks:[],hw:[],events:[],sched:{odd:{'1':[{subj:'Существующая пара',s:'09:30',e:'10:30'}]},even:{}}},revision:0})});
    if(body.action==='save'){savedProfile=body.data;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,revision:1})})}
    return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Unknown action'})});
  });
  try {
    await page.goto('http://127.0.0.1:4174/ocr.html',{waitUntil:'domcontentloaded'});
    await page.locator('#file').waitFor();
    await page.waitForFunction(()=>window.Tesseract&&typeof window.Tesseract.createWorker==='function',{timeout:30000});
    if(await page.locator('#extract').isDisabled()!==true) throw new Error('Extract must be disabled until a file is selected');
    await page.locator('#file').setInputFiles({name:'empty.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(0)});
    await page.getByText('Файл пустой. Выбери другой документ.').waitFor();
    if(await page.locator('#extract').isDisabled()!==true) throw new Error('Empty file must be rejected');
    await page.locator('#file').setInputFiles({name:'unsupported.exe',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});
    await page.getByText('Этот формат пока не поддерживается. Выбери PDF или изображение.').waitFor();
    if(await page.locator('#extract').isDisabled()!==true) throw new Error('Unsupported file must be rejected');
    await page.locator('#file').setInputFiles({name:'two-pages.pdf',mimeType:'application/pdf',buffer:makePdf(['MYDAY PDF PAGE ONE','MYDAY PDF PAGE TWO'])});
    await page.getByText(/PDF открыт\. Страниц: 2/).waitFor({timeout:15000});
    if(await page.locator('#pageNo').inputValue()!=='1') throw new Error('PDF preview did not start at page 1');
    await page.locator('#next').click();
    await page.waitForFunction(()=>document.querySelector('#pageNo').value==='2');
    if(await page.locator('#pageNo').inputValue()!=='2') throw new Error('Next page control did not work');
    await page.locator('#prev').click();
    await page.waitForFunction(()=>document.querySelector('#pageNo').value==='1');
    if(await page.locator('#pageNo').inputValue()!=='1') throw new Error('Previous page control did not work');
    await page.locator('#extract').click();
    await page.locator('#textPanel').waitFor({state:'visible',timeout:20000});
    const extracted=await page.locator('#output').inputValue();
    if(!extracted.includes('MYDAY PDF PAGE ONE')||!extracted.includes('MYDAY PDF PAGE TWO')) throw new Error('PDF text extraction failed: '+extracted);
    await page.locator('#analyze').click();
    await page.locator('#resultPanel').waitFor({state:'visible',timeout:15000});
    await page.getByText('Проверочная задача',{exact:true}).waitFor();
    await page.locator('input[data-kind="events"]').uncheck();
    await page.locator('#save').click();
    await page.getByText(/Сохранено в MYDAY: 1/).waitFor({timeout:15000});
    if(!savedProfile || savedProfile.tasks.length!==1 || savedProfile.events.length!==0) throw new Error('Selected-item import did not save the expected profile');
    if(savedProfile.sched.odd['1'].length!==1) throw new Error('Conflicting timetable entry was not skipped');
    await page.getByText(/Пропущено из-за пересечений: 1/).waitFor();
    failAnalyze=true;await page.locator('#analyze').click();
    await page.getByText('Тестовая ошибка ИИ',{exact:true}).waitFor();
    if(!(await page.locator('#output').inputValue()).includes('MYDAY PDF PAGE ONE')) throw new Error('Recognized text was lost after AI provider failure');
    failAnalyze=false;
    const cache=await page.evaluate(()=>({profile:localStorage.getItem('myday2:user:12345'),base:localStorage.getItem('myday2:sync-base:12345'),revision:localStorage.getItem('myday2:sync-revision:12345')}));
    if(!cache.profile||!cache.base||cache.revision!=='1') throw new Error('Local MYDAY cache was not aligned after cloud save');
    const pngBase64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1800;c.height=500;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';x.font='bold 130px Arial';x.fillText('MYDAY OCR TEST 123',90,300);return c.toDataURL('image/png').split(',')[1]});
    await page.locator('#file').setInputFiles({name:'ocr-sample.png',mimeType:'image/png',buffer:Buffer.from(pngBase64,'base64')});
    await page.getByText('Изображение готово к распознаванию.').waitFor();
    await page.locator('#extract').click();
    await page.locator('#textPanel').waitFor({state:'visible',timeout:120000});
    const ocrText=(await page.locator('#output').inputValue()).toUpperCase();
    if(!ocrText.includes('MYDAY')||!ocrText.includes('OCR')) throw new Error('Real image OCR failed: '+ocrText);
    await page.locator('#back').click();
    await page.locator('#app .page-title').waitFor({timeout:15000});
    await page.locator('#nav button').nth(4).click();
    await page.getByRole('button',{name:/Разбор документов/}).click();
    await page.locator('#file').waitFor({timeout:15000});
    if(errors.length) throw new Error('Browser runtime errors: '+errors.join(' | '));
    console.log(JSON.stringify({result:'passed',tests:['file selection','empty/unsupported file validation','PDF preview','next/previous page controls','two-page text extraction','AI analysis UI','selective import','cloud profile save','schedule conflict prevention','AI failure recovery','real image OCR','return navigation','open analyzer from MYDAY menu'],savedTasks:savedProfile.tasks.length,savedEvents:savedProfile.events.length,errors,failedRequests:failed},null,2));
  } finally { await context.close();await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
