(() => {
  'use strict';

  const LAB_VERSION = '1.0.0';
  const DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const DAY_NAMES = { 'вс':0,'воскресенье':0,'пн':1,'понедельник':1,'вт':2,'вторник':2,'ср':3,'среда':3,'ср.':3,'чт':4,'четверг':4,'пт':5,'пятница':5,'сб':6,'суббота':6 };
  let importDraft = null;

  function cfg() {
    S.scheduleConfig = S.scheduleConfig || { studyMode:'alternating', cycleWeeks:2, cycleAnchor:'', selectedDate:'' };
    S.workConfig = S.workConfig || { mode:'weekly', pattern:['work','work','off','off'], anchorDate:'', start:'09:00', end:'18:00', title:'Рабочая смена', exceptions:{} };
    S.workConfig.exceptions = S.workConfig.exceptions || {};
    S.settings.notifications = { study:true, work:true, personal:true, ...(S.settings.notifications||{}) };
    S.settings.dashboard = S.settings.dashboard || { workShift:true, habits:false, notes:false };
    S.settings.dashboardOrder = Array.isArray(S.settings.dashboardOrder) ? S.settings.dashboardOrder : ['workShift','habits','notes'];
    S.habits = Array.isArray(S.habits) ? S.habits : [];
    S.sched = S.sched || {};
    for (const key of ['odd','even','work','fixed','cycle','dates']) S.sched[key] = S.sched[key] || {};
    return S.scheduleConfig;
  }

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const fromIso = s => new Date(String(s || today()) + 'T12:00:00');
  const shiftDate = (s,n) => { const d=fromIso(s); d.setDate(d.getDate()+n); return iso(d); };
  const mondayOf = s => { const d=fromIso(s); d.setDate(d.getDate()-((d.getDay()+6)%7)); return iso(d); };
  const dayDiff = (a,b) => Math.round((fromIso(a)-fromIso(b))/86400000);
  const selectedDate = () => { const v=cfg().selectedDate || today(); return fromIso(v).getDay()===0 ? shiftDate(v,1) : v; };
  const setSelectedDate = s => { cfg().selectedDate=s; const d=fromIso(s); sd=d.getDay()||1; save(); };
  const id = () => Math.random().toString(36).slice(2,10);

  function cycleIndex(date) {
    const c=cfg(), n=Math.max(2,Math.min(4,Number(c.cycleWeeks)||2));
    const anchor=mondayOf(c.cycleAnchor || S.settings.weekAnchor || today());
    const week=mondayOf(date);
    return ((Math.floor(dayDiff(week,anchor)/7)%n)+n)%n;
  }
  function weekType(date) {
    const d=fromIso(date);
    return wk(d);
  }
  function currentBucketKey(date) {
    const mode=cfg().studyMode || 'alternating';
    if (mode==='fixed') return 'fixed';
    if (mode==='dates') return 'date:'+date;
    if (mode==='cycle') return 'cycle:'+cycleIndex(date);
    if (mode==='hybrid') return 'fixed';
    return weekType(date);
  }
  function editorKey(date) {
    const mode=cfg().studyMode || 'alternating';
    if (mode==='fixed') return 'fixed';
    if (mode==='dates') return 'date:'+date;
    if (mode==='cycle') return 'cycle:'+cycleIndex(date);
    if (mode==='hybrid') return st==='fixed' ? 'fixed' : ((st==='odd'||st==='even')?st:weekType(date));
    return (st==='odd'||st==='even')?st:weekType(date);
  }
  function selectedWeekDates(date) {
    const monday=mondayOf(date);
    return [1,2,3,4,5,6].map(day => shiftDate(monday,day-1));
  }
  function updateSelectedDay(day) {
    sd=day;
    const dates=selectedWeekDates(selectedDate());
    const d=dates.find(x=>fromIso(x).getDay()===day);
    if (d) cfg().selectedDate=d;
    save(); render();
  }

  function workShiftForDate(date) {
    const c=S.workConfig || {};
    if (c.mode!=='rotation') { const list=((S.sched&&S.sched.work)||{})[fromIso(date||today()).getDay()]||[]; return list.length?{...list[0],_workShift:true,date:String(date||today())}:null; }
    const key=String(date || today());
    const ex=(c.exceptions||{})[key];
    if (ex==='off' || (ex && ex.off===true)) return null;
    if (ex && ex.off===false) return { id:'shift_'+key, subj:ex.title||c.title||'Рабочая смена', s:ex.start||c.start||'09:00', e:ex.end||c.end||'18:00', room:ex.place||'', teacher:'', _workShift:true, date:key };
    const anchor=c.anchorDate || today();
    const pattern=Array.isArray(c.pattern)&&c.pattern.length?c.pattern:['work','work','off','off'];
    const index=((dayDiff(key,anchor)%pattern.length)+pattern.length)%pattern.length;
    const item=pattern[index];
    const isWork=item==='work'||item===1||item==='1'||(item&&typeof item==='object'&&item.type==='work');
    if (!isWork) return null;
    const obj=item&&typeof item==='object'?item:{};
    return { id:'shift_'+key, subj:obj.title||c.title||'Рабочая смена', s:obj.start||c.start||'09:00', e:obj.end||c.end||'18:00', room:obj.place||'', teacher:'', _workShift:true, date:key };
  }
  function workShiftList(start,count) {
    const out=[];
    for(let i=0;i<count;i++){const d=shiftDate(start,i),x=workShiftForDate(d);out.push({date:d,shift:x});}
    return out;
  }

  function injectTools(html) {
    if(st!==null)return html;
    const N=S.settings.notifications||{study:true,work:true,personal:true};
    const notificationPanel='<section class="section"><div class="section-head"><div><h2>Уведомления по разделам</h2><p class="section-caption">Можно отключать независимо друг от друга.</p></div></div><div class="surface-panel">'+
      '<label class="lab-check"><input type="checkbox" '+(N.study===false?'':'checked')+' onchange="MYDAY_LAB.toggleNotification(\'study\',this.checked)"> Учёба: пары и домашние задания</label>'+
      '<label class="lab-check"><input type="checkbox" '+(N.work===false?'':'checked')+' onchange="MYDAY_LAB.toggleNotification(\'work\',this.checked)"> Работа: смены и рабочие задачи</label>'+
      '<label class="lab-check"><input type="checkbox" '+(N.personal===false?'':'checked')+' onchange="MYDAY_LAB.toggleNotification(\'personal\',this.checked)"> Личное: задачи и напоминания</label>'+
      '<p class="page-sub">Напоминания работают, пока приложение активно. iOS может приостанавливать их в фоне.</p></div></section>';
    const extra = '<section class="section lab-tools"><div class="section-head"><div><h2>Расширенные возможности</h2><p class="section-caption">Импорт, графики и личная настройка</p></div></div><div class="settings-list">' +
      labTool('schedule-settings','Тип расписания','Фиксированное, сменное по неделям, цикл или даты','calendar') +
      labTool('schedule-import','Импорт расписания','Excel, PDF, Word, CSV и фотографии','inbox') +
      labTool('work-shifts','Сменный график','2/2, 5/2, 1/3 или свой цикл','calendar') +
      labTool('personalize','Главный экран','Виджеты и порядок блоков','settings') +
      labTool('habits','Привычки','Небольшой трекер ежедневных действий','stats') +
      '</div></section>';
    return html.replace('</main>', notificationPanel + extra + '</main>');
  }
  function labTool(route,title,desc,icon) {
    return '<button class="settings-card" type="button" onclick="st=\''+route+'\';render()"><span class="settings-icon">'+mydayIcon(icon,16)+'</span><span class="settings-copy"><b>'+title+'</b><small>'+desc+'</small></span><span class="settings-arrow">'+mydayIcon('chevron',16)+'</span></button>';
  }

  function renderScheduleSettings() {
    const c=cfg(),mode=c.studyMode||'alternating';
    const modes=[
      ['alternating','Нечётная / чётная','Два расписания, которые чередуются каждую неделю'],
      ['fixed','Постоянное','Один и тот же план каждую неделю'],
      ['cycle','Цикл на 2–4 недели','Например, повторение каждые три недели'],
      ['dates','По конкретным датам','Каждый день задаётся отдельно'],
      ['hybrid','Смешанное','Постоянные пары плюс отдельные пары по неделям']
    ];
    return '<main class="page">'+mydayHeader('Тип расписания','MYDAY не будет заставлять всех жить по нечётным и чётным неделям.',false,true)+
      '<section class="surface-panel"><label for="lab-mode">Как устроено ваше расписание</label><select id="lab-mode" onchange="MYDAY_LAB.setStudyMode(this.value)">'+modes.map(([v])=>'<option value="'+v+'" '+(mode===v?'selected':'')+'>'+modes.find(x=>x[0]===v)[1]+'</option>').join('')+'</select>'+
      '<div class="lab-mode-list">'+modes.map(([v,t,d])=>'<div class="lab-mode-item '+(mode===v?'active':'')+'"><b>'+t+'</b><span>'+d+'</span></div>').join('')+'</div>'+
      (mode==='cycle'?'<label for="lab-cycle">Длина цикла, недель</label><select id="lab-cycle" onchange="MYDAY_LAB.setCycleWeeks(this.value)">'+[2,3,4].map(n=>'<option value="'+n+'" '+(Number(c.cycleWeeks||2)===n?'selected':'')+'>'+n+' недели</option>').join('')+'</select><label for="lab-anchor">Первая неделя цикла начинается</label><input id="lab-anchor" type="date" value="'+esc(c.cycleAnchor||mondayOf(today()))+'" onchange="MYDAY_LAB.setCycleAnchor(this.value)"><p class="page-sub">Укажи понедельник первой недели. Дальше цикл будет повторяться автоматически.</p>':'')+
      (mode==='hybrid'?'<p class="page-sub">В разделе «План» появятся три слоя: постоянные занятия, нижняя неделя и верхняя неделя. Постоянные пары будут добавляться к выбранной неделе.</p>':'')+
      (mode==='dates'?'<p class="page-sub">Занятия по датам можно импортировать из файла или добавлять на выбранную дату. Если для даты нет записи, постоянный шаблон не подставляется.</p>':'')+
      '<div class="schedule-actions"><button class="btn" type="button" onclick="go(\'sched\')">Открыть расписание</button><button class="btn g" type="button" onclick="go(\'more\');st=\'schedule-import\';render()">Импортировать файл</button></div></section>'+
      '<section class="section"><div class="section-head"><div><h2>Сохранность данных</h2><p class="section-caption">Переключение режима не удаляет старые пары.</p></div></div><div class="empty-state"><b>Ничего не стирается автоматически</b><span>Старые расписания остаются в профиле. Новый режим начинает использовать свой отдельный набор записей.</span></div></section>'+
      '<button class="btn g" type="button" style="width:100%" onclick="st=null;render()">Назад</button></main>';
  }
  function renderWorkWeeklyPage() {
    const date=selectedDate(),day=fromIso(date).getDay()||1,bucket=scheduleBucket('work','work'),list=(bucket[day]||[]).slice().sort((a,b)=>a.s.localeCompare(b.s));
    const dates=selectedWeekDates(date);
    return '<main class="page">'+mydayHeader('Рабочее расписание','Повторяющийся график по дням недели.',true,true)+'<div class="row lab-date-row"><label for="lab-date">Дата просмотра</label><input id="lab-date" type="date" value="'+date+'" onchange="MYDAY_LAB.selectDate(this.value)"></div><section class="schedule-control"><div class="day-strip">'+dates.map(x=>{const n=fromIso(x).getDay();return '<button class="day-pill '+(n===day?'on ':'')+(x===today()?'today':'')+'" onclick="MYDAY_LAB.selectDate(\''+x+'\')"><strong>'+DAYS_SHORT[n]+'</strong><small>'+x.slice(8,10)+'</small></button>'}).join('')+'</div></section><div class="schedule-day-head"><div><div class="eyebrow">'+DAYS_SHORT[day].toUpperCase()+' · '+date+'</div><h2>'+DAYS_SHORT[day]+'</h2><p>'+list.length+' записей</p></div><button class="btn" onclick="lessonForm(\'work\')">'+mydayIcon('plus',16)+' Добавить</button></div>'+(list.length?'<section class="schedule-wrap">'+mydayLessons(list,null,l=>'lessonForm(\'work\',\''+l.id+'\')')+'</section>':mydayEmpty('На этот день записей нет','Добавь рабочее время, встречу или смену.'))+'<div class="schedule-actions"><button class="btn g" onclick="go(\'more\');st=\'work-shifts\';render()">Настроить смены</button><button class="btn g" onclick="go(\'more\');st=\'schedule-import\';render()">Импорт файла</button></div></main>';
  }

  function renderSchedulePage() {
    if(schedSpace==='work')return renderWorkWeeklyPage();
    const c=cfg(),date=selectedDate(),mode=c.studyMode||'alternating';
    const d=fromIso(date),day=d.getDay()||1;
    const bucketKey=editorKey(date);
    const bucket=scheduleBucket('study',bucketKey);
    const list=(bucket[day]||[]).slice().sort((a,b)=>a.s.localeCompare(b.s));
    const weekDates=selectedWeekDates(date);
    const dayHtml=weekDates.map(x=>{const n=fromIso(x).getDay();return '<button class="day-pill '+(n===day?'on ':'')+(x===today()?'today':'')+'" type="button" aria-pressed="'+(x===date)+'" onclick="MYDAY_LAB.selectDate(\''+x+'\')"><strong>'+DAYS_SHORT[n]+'</strong><small>'+x.slice(8,10)+'</small></button>';}).join('');
    let layer='';
    if(mode==='alternating') layer='<div class="segmented"><button class="seg-btn '+(bucketKey==='odd'?'on':'')+'" onclick="MYDAY_LAB.setLayer(\'odd\')">Нижняя · нечётная</button><button class="seg-btn '+(bucketKey==='even'?'on':'')+'" onclick="MYDAY_LAB.setLayer(\'even\')">Верхняя · чётная</button></div>';
    if(mode==='hybrid') layer='<div class="segmented"><button class="seg-btn '+(bucketKey==='fixed'?'on':'')+'" onclick="MYDAY_LAB.setLayer(\'fixed\')">Постоянные</button><button class="seg-btn '+(bucketKey==='odd'?'on':'')+'" onclick="MYDAY_LAB.setLayer(\'odd\')">Нижняя</button><button class="seg-btn '+(bucketKey==='even'?'on':'')+'" onclick="MYDAY_LAB.setLayer(\'even\')">Верхняя</button></div>';
    if(mode==='cycle') layer='<div class="chip-row">'+Array.from({length:Math.max(2,Math.min(4,Number(c.cycleWeeks)||2))},(_,i)=>'<button class="chip '+(bucketKey==='cycle:'+i?'on':'')+'" onclick="MYDAY_LAB.setLayer(\'cycle:'+i+'\')">Неделя '+(i+1)+'</button>').join('')+'</div>';
    const weekLabel=mode==='alternating'?wkName(bucketKey):mode==='fixed'?'Постоянное расписание':mode==='cycle'?'Цикл · неделя '+(cycleIndex(date)+1):mode==='dates'?'Отдельная дата':'Смешанное расписание';
    const title=mode==='dates'?'Занятия на дату':'Расписание';
    return '<main class="page">'+mydayHeader(title,weekLabel,true,true)+
      '<div class="row lab-date-row"><label for="lab-date">Дата просмотра</label><input id="lab-date" type="date" value="'+date+'" onchange="MYDAY_LAB.selectDate(this.value)"></div>'+
      layer+'<section class="schedule-control"><div class="day-strip">'+dayHtml+'</div></section>'+
      '<div class="schedule-day-head"><div><div class="eyebrow">'+DAYS_SHORT[day].toUpperCase()+' · '+date+'</div><h2>'+DAYS_SHORT[day]+'</h2><p>'+list.length+' '+ruCount(list.length,'занятие','занятия','занятий')+'</p></div><button class="btn" type="button" onclick="lessonForm(\''+bucketKey+'\')">'+mydayIcon('plus',16)+' Добавить</button></div>'+
      (list.length?'<section class="schedule-wrap">'+mydayLessons(list,null,l=>'lessonForm(\''+bucketKey+'\',\''+l.id+'\')')+'</section>':mydayEmpty('На эту дату записей нет','Добавь занятие вручную или загрузи файл с расписанием.'))+
      '<div class="schedule-actions"><button class="btn g" type="button" onclick="go(\'more\');st=\'schedule-import\';render()">'+mydayIcon('inbox',16)+' Импорт файла</button><button class="btn g" type="button" onclick="go(\'more\');st=\'schedule-settings\';render()">Тип расписания</button></div></main>';
  }

  function renderWorkRotationPage() {
    const c=S.workConfig||{},date=c.selectedDate||today(),shift=workShiftForDate(date),days=workShiftList(date,14);
    return '<main class="page">'+mydayHeader('Сменный график','Рабочие и выходные дни рассчитываются по циклу.',true,true)+
      '<section class="surface-panel"><label for="work-date">Дата</label><input id="work-date" type="date" value="'+date+'" onchange="MYDAY_LAB.selectWorkDate(this.value)">'+
      (shift?'<div class="work-shift-card"><span class="eyebrow">РАБОЧАЯ СМЕНА</span><b>'+esc(shift.subj)+'</b><strong>'+shift.s+'–'+shift.e+'</strong></div>':'<div class="empty-state"><b>Выходной</b><span>По текущему циклу смена на эту дату не запланирована.</span></div>')+
      '<div class="schedule-actions"><button class="btn" onclick="go(\'more\');st=\'work-shifts\';render()">Настроить цикл</button><button class="btn g" onclick="MYDAY_LAB.toggleWorkException(\''+date+'\')">'+(shift?'Сделать выходным':'Добавить смену')+'</button></div></section>'+
      '<section class="section"><div class="section-head"><div><h2>Следующие 14 дней</h2><p class="section-caption">Цикл считается от выбранной даты начала.</p></div></div><div class="week-list">'+days.map(x=>'<button class="week-day-card" onclick="MYDAY_LAB.selectWorkDate(\''+x.date+'\')"><span class="week-day-date">'+x.date.slice(8,10)+'<small>'+DAYS_SHORT[fromIso(x.date).getDay()]+'</small></span><span class="week-day-summary"><b>'+ (x.shift?esc(x.shift.subj):'Выходной') +'</b><small>'+(x.shift?x.shift.s+'–'+x.shift.e:'Без смены')+'</small></span><span class="week-day-arrow">›</span></button>').join('')+'</div></section></main>';
  }

  function renderWorkSettings() {
    const c=S.workConfig||{},preset=Array.isArray(c.pattern)?c.pattern.map(x=>x==='work'||x===1||x==='1'?'Р':'В').join(''):'РРВВ';
    return '<main class="page">'+mydayHeader('Рабочие смены','Фиксированный график или повторяющийся цикл.',false,true)+
      '<section class="surface-panel"><label for="work-mode">Тип графика</label><select id="work-mode" onchange="MYDAY_LAB.setWorkMode(this.value)"><option value="weekly" '+(c.mode!=='rotation'?'selected':'')+'>Одинаковая неделя</option><option value="rotation" '+(c.mode==='rotation'?'selected':'')+'>Сменный цикл</option></select>'+
      (c.mode==='rotation'?'<label for="work-pattern">Цикл (Р — рабочий день, В — выходной)</label><input id="work-pattern" value="'+preset+'" maxlength="28" autocapitalize="characters"><div class="chip-row"><button class="chip" onclick="MYDAY_LAB.setWorkPreset(\'РРВВ\')">2/2</button><button class="chip" onclick="MYDAY_LAB.setWorkPreset(\'РРРРРВВ\')">5/2</button><button class="chip" onclick="MYDAY_LAB.setWorkPreset(\'РВВВ\')">1/3</button></div><label for="work-anchor">Первый день цикла</label><input id="work-anchor" type="date" value="'+esc(c.anchorDate||today())+'"><label for="work-title">Название смены</label><input id="work-title" value="'+esc(c.title||'Рабочая смена')+'"><div class="row"><div class="grow"><label for="work-start">Начало</label><input id="work-start" type="time" value="'+esc(c.start||'09:00')+'"></div><div class="grow"><label for="work-end">Конец</label><input id="work-end" type="time" value="'+esc(c.end||'18:00')+'"></div></div><button class="btn" style="width:100%" onclick="MYDAY_LAB.saveWorkSettings()">Сохранить цикл</button><p class="page-sub">Распределение смен сохраняется в вашем профиле Telegram и синхронизируется с MYDAY.</p>':'<p class="page-sub">Для одинаковой рабочей недели откройте «План → Работа» и добавьте события по дням.</p>')+
      '<button class="btn g" style="width:100%;margin-top:8px" onclick="go(\'sched\');schedSpace=\'work\';render()">Открыть рабочий план</button></section></main>';
  }

  function renderImportPage() {
    if (!importDraft) importDraft={records:[],groups:[],selectedGroup:'',sourceType:'',target:'study',mode:'auto',replace:false,filename:'',status:'Выбери файл. Исходное расписание пока не меняется.'};
    const d=importDraft,records=d.records||[],groups=d.groups||[];
    const selected=groups.length?records.filter(r=>r.group===d.selectedGroup):records;
    const canPreview=groups.length?!!d.selectedGroup:d.sourceType==='personal';
    const sourcePicker=records.length&&!groups.length
      ? '<section class="surface-panel"><label for="import-source-type">Что загружено?</label><select id="import-source-type" onchange="MYDAY_LAB.setDraft(\'sourceType\',this.value)"><option value="">Выбери тип расписания…</option><option value="personal" '+(d.sourceType==='personal'?'selected':'')+'>Моё личное расписание</option><option value="university" '+(d.sourceType==='university'?'selected':'')+'>Общее расписание университета</option></select><p class="page-sub">Если это общее расписание, но названия групп не распознаны, MYDAY не даст сохранить весь документ как личный. Сначала нужно корректно определить группу.</p></section>'
      : '';
    const groupPicker=groups.length
      ? '<section class="surface-panel"><div class="section-head"><div><h2>Выбери свою группу</h2><p class="section-caption">В файле найдено групп: '+groups.length+'. В MYDAY попадут только занятия выбранной группы.</p></div></div><label for="import-group">Учебная группа</label><select id="import-group" onchange="MYDAY_LAB.setDraft(\'selectedGroup\',this.value)"><option value="">Выбрать группу…</option>'+groups.map(g=>'<option value="'+esc(g)+'" '+(d.selectedGroup===g?'selected':'')+'>'+esc(g)+'</option>').join('')+'</select></section>'
      : '';
    const formats='Excel XLSX/XLS · PDF · Word DOCX · CSV/TXT · JPG/PNG';
    return '<main class="page">'+mydayHeader('Импорт расписания','Загрузи личный файл или общее расписание университета, выбери свою группу и проверь результат.',false,true)+
      '<section class="surface-panel"><div class="import-drop"><span class="settings-icon">'+mydayIcon('inbox',22)+'</span><b>Выбрать файл</b><span class="page-sub">'+formats+'</span><input id="schedule-file" type="file" accept=".xlsx,.xls,.pdf,.docx,.csv,.txt,.jpg,.jpeg,.png" onchange="MYDAY_LAB.readFile(this)"><a href="./sample-university-schedule.csv" download>Скачать пример общего расписания</a><button class="btn g" type="button" onclick="MYDAY_LAB.loadSample()">Загрузить тестовый пример</button></div>'+
      '<p class="page-sub" role="status" aria-live="polite">'+esc(d.status)+'</p><label for="import-target">Куда импортировать</label><select id="import-target" onchange="MYDAY_LAB.setDraft(\'target\',this.value)"><option value="study" '+(d.target==='study'?'selected':'')+'>Учебное расписание</option><option value="work" '+(d.target==='work'?'selected':'')+'>Рабочий график (неделя)</option></select>'+
      '<label for="import-mode">Тип учебного расписания</label><select id="import-mode" onchange="MYDAY_LAB.setDraft(\'mode\',this.value)"><option value="auto" '+(d.mode==='auto'?'selected':'')+'>Определить по файлу</option><option value="alternating" '+(d.mode==='alternating'?'selected':'')+'>Нечётная / чётная</option><option value="fixed" '+(d.mode==='fixed'?'selected':'')+'>Постоянное</option><option value="cycle" '+(d.mode==='cycle'?'selected':'')+'>Цикл 2–4 недели</option><option value="dates" '+(d.mode==='dates'?'selected':'')+'>Конкретные даты</option><option value="hybrid" '+(d.mode==='hybrid'?'selected':'')+'>Смешанное</option></select>'+
      '<label for="import-replace" class="lab-check"><input id="import-replace" type="checkbox" '+(d.replace?'checked':'')+' onchange="MYDAY_LAB.setDraft(\'replace\',this.checked)"> Заменить занятия в выбранных днях (вместо добавления)</label>'+
      '<div class="page-sub">Старое расписание не меняется до подтверждения. В общий календарь попадут только записи из выбранной группы.</div></section>'+
      sourcePicker+groupPicker+
      (groups.length&&!d.selectedGroup?'<div class="empty-state"><b>Сначала выбери свою группу</b><span>Пока группа не выбрана, сохранить расписание нельзя.</span></div>':'')+
      (!groups.length&&d.sourceType==='university'?'<div class="empty-state"><b>Группы не распознаны</b><span>Импорт заблокирован, чтобы случайно не добавить расписание всего университета. Нужен файл, где названия групп находятся в заголовках столбцов, в колонке «Группа» или в названиях листов Excel.</span></div>':'')+
      (canPreview&&selected.length?'<section class="section"><div class="section-head"><div><h2>Предпросмотр · '+selected.length+'</h2><p class="section-caption">'+(d.selectedGroup?'Группа '+esc(d.selectedGroup)+' · ':'Личное расписание · ')+'Нажми на строку, чтобы исправить распознавание.</p></div></div><div class="task-list">'+selected.map(r=>({r,i:records.indexOf(r)})).map(({r,i})=>'<button class="task-item import-row" onclick="MYDAY_LAB.editDraft('+i+')"><span class="settings-icon">'+mydayIcon('calendar',16)+'</span><span class="task-main"><span class="task-title">'+esc(r.subj||'Без названия')+'</span><span class="task-meta">'+esc(r.group?r.group+' · ':'')+esc(r.date||((r.day!=null?DAYS_SHORT[r.day]:'День не распознан')+' · '+(r.week||'неделя не указана'))) +' · '+esc((r.s||'--:--')+'–'+(r.e||'--:--'))+'</span></span><span class="task-chevron">›</span></button>').join('')+'</div><div class="schedule-actions"><button class="btn" onclick="MYDAY_LAB.applyImport()">Сохранить расписание</button><button class="btn g" onclick="MYDAY_LAB.clearDraft()">Очистить</button></div></section>':'<div class="empty-state"><b>Предпросмотр появится здесь</b><span>'+(groups.length?'Выбери группу, чтобы увидеть только её занятия.':d.sourceType==='personal'?'Проверь распознанные строки перед сохранением.':'Сначала укажи, личное это расписание или общее расписание университета.')+'</span></div>')+
      '<button class="btn g" style="width:100%" onclick="st=null;render()">Назад</button></main>';
  }

  function renderPersonalize() {
    const c=S.settings.dashboard,labels={workShift:'Рабочая смена',habits:'Привычки',notes:'Быстрые заметки'};
    const order=S.settings.dashboardOrder;
    return '<main class="page">'+mydayHeader('Главный экран','Выбери дополнительные блоки и их порядок.',false,true)+
      '<section class="surface-panel">'+order.map((key,i)=>'<div class="settings-row"><label class="lab-check"><input type="checkbox" '+(c[key]?'checked':'')+' onchange="MYDAY_LAB.toggleWidget(\''+key+'\',this.checked)"> '+labels[key]+'</label><div class="row"><button class="icon-btn" '+(i===0?'disabled':'')+' onclick="MYDAY_LAB.moveWidget('+i+',-1)">↑</button><button class="icon-btn" '+(i===order.length-1?'disabled':'')+' onclick="MYDAY_LAB.moveWidget('+i+',1)">↓</button></div></div>').join('')+
      '<p class="page-sub">Основные разделы «Расписание», «Задачи» и «Учёба» остаются доступными. Здесь настраиваются дополнительные карточки.</p></section><button class="btn g" style="width:100%" onclick="st=null;render()">Назад</button></main>';
  }

  function renderHabits() {
    const list=S.habits||[];
    return '<main class="page">'+mydayHeader('Привычки','Небольшие повторяющиеся действия, без геймификации.',true,true)+
      '<section class="surface-panel"><div class="row"><input id="habit-name" placeholder="Например, 10 минут чтения"><button class="btn" onclick="MYDAY_LAB.addHabit()">Добавить</button></div></section>'+
      (list.length?'<div class="task-list">'+list.map(h=>'<div class="task-item"><button class="task-check '+(h.log&&h.log[today()]?'on':'')+'" onclick="MYDAY_LAB.toggleHabit(\''+h.id+'\')">'+mydayIcon('check',14)+'</button><span class="task-main"><span class="task-title">'+esc(h.name)+'</span><span class="task-meta">'+Object.values(h.log||{}).filter(Boolean).length+' отметок всего</span></span><button class="icon-btn" onclick="MYDAY_LAB.deleteHabit(\''+h.id+'\')">×</button></div>').join('')+'</div>':mydayEmpty('Пока нет привычек','Добавь только то, что действительно хочешь отслеживать.'))+
      '<button class="btn g" style="width:100%;margin-top:12px" onclick="st=null;render()">Назад</button></main>';
  }

  function renderCalendar() {
    const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+(cm||0));
    const y=base.getFullYear(),m=base.getMonth(),off=(base.getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
    let cells='';for(let i=0;i<off;i++)cells+='<div class="cal-day outside"></div>';
    for(let d=1;d<=dim;d++){
      const k=iso(new Date(y,m,d)),has=calendarItems(k).length;
      cells+='<button class="cal-day '+(k===today()?'is-today ':'')+(k===cdsel?'selected':'')+'" onclick="cdsel=\''+k+'\';render()"><b>'+d+'</b>'+(has?'<i></i>':'')+'</button>';
    }
    const items=calendarItems(cdsel||today());
    return '<main class="page">'+mydayHeader('Календарь','Учёба, работа, задачи и личные события в одной ленте.',false,true)+
      '<section class="schedule-control"><div class="calendar-heading"><button class="icon-btn" onclick="cm--;render()">‹</button><h2>'+base.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})+'</h2><button class="icon-btn" onclick="cm++;render()">›</button></div><div class="calendar-grid calendar-weekdays">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="calendar-grid">'+cells+'</div><button class="text-link" onclick="cdsel=today();cm=0;render()">Сегодня</button></section>'+
      '<section class="section">'+mydaySection(fmt(cdsel||today()),items.length+' записей')+(items.length?'<div class="task-list">'+items.map(x=>'<div class="task-item"><span class="settings-icon">'+mydayIcon('calendar',16)+'</span><span class="task-main"><span class="task-title">'+esc(x.title)+'</span><span class="task-meta">'+esc(x.meta)+'</span></span></div>').join('')+'</div>':mydayEmpty('День свободен','На эту дату пока ничего не запланировано.'))+'</section></main>';
  }
  function calendarItems(date) {
    const out=[],d=fromIso(date),L=lessons(d);
    L.forEach(x=>out.push({title:x.subj,meta:'Учёба · '+x.s+'–'+x.e+(x.room?' · '+x.room:'' )}));
    if(S.workConfig&&S.workConfig.mode==='rotation'){const shift=workShiftForDate(date);if(shift)out.push({title:shift.subj,meta:'Работа · '+shift.s+'–'+shift.e})}else{(((S.sched||{}).work||{})[d.getDay()]||[]).forEach(x=>out.push({title:x.subj,meta:'Работа · '+x.s+'–'+x.e}))}
    S.tasks.filter(x=>x.due===date&&x.status!==2).forEach(x=>out.push({title:x.title,meta:(x.space==='work'?'Работа':'Задача')+(x.cat?' · '+x.cat:'')}));
    S.hw.filter(x=>x.due===date&&x.status!==2).forEach(x=>out.push({title:subj(x.subj)+': '+x.title,meta:'Домашнее задание'}));
    (S.events||[]).filter(x=>x.date===date).forEach(x=>out.push({title:x.title,meta:x.type||'Событие'}));
    return out;
  }

  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    if (window.__mydayScriptPromises && window.__mydayScriptPromises[src]) return window.__mydayScriptPromises[src];
    window.__mydayScriptPromises=window.__mydayScriptPromises||{};
    window.__mydayScriptPromises[src]=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=src;s.async=true;s.onload=()=>test()?resolve():reject(new Error('Библиотека не загрузилась'));s.onerror=()=>reject(new Error('Не удалось загрузить компонент распознавания'));document.head.appendChild(s);
    });
    return window.__mydayScriptPromises[src];
  }
  const timeRegex=/([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)/;
  function normalizeTime(h,m){return String(Number(h)).padStart(2,'0')+':'+m;}
  function parseLine(line,context) {
    let text=String(line||'').replace(/\u00a0/g,' ').trim();if(!text)return [];
    const lower=text.toLowerCase();
    let day=context.day;
    for(const [name,n] of Object.entries(DAY_NAMES)){if(new RegExp('(^|[^а-я])'+name+'([^а-я]|$)','i').test(lower)){day=n;break}}
    let week=context.week||'';
    if(/неч[её]тн|нижн/.test(lower))week='odd';
    else if(/ч[её]тн|верхн/.test(lower))week='even';
    const cycleMatch=lower.match(/(?:цикл|недел[яи])\s*([1-4])/),cycleIndex=cycleMatch?Number(cycleMatch[1])-1:null;
    const dateMatch=text.match(/\b(20\d{2})[-.](\d{1,2})[-.](\d{1,2})\b|\b(\d{1,2})[.](\d{1,2})[.](20\d{2})\b/);
    let date='';
    if(dateMatch){date=dateMatch[1]?dateMatch[1]+'-'+String(dateMatch[2]).padStart(2,'0')+'-'+String(dateMatch[3]).padStart(2,'0'):dateMatch[6]+'-'+String(dateMatch[5]).padStart(2,'0')+'-'+String(dateMatch[4]).padStart(2,'0')}
    const matches=[...text.matchAll(new RegExp(timeRegex.source,'g'))];if(!matches.length)return [];
    const out=[];
    matches.forEach((m,index)=>{
      let s=normalizeTime(m[1],m[2]),eTime=normalizeTime(m[3],m[4]);if(eTime<=s)return;
      let rest=text.replace(m[0],' ').replace(/(^|[^а-яё])(?:понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс)(?=$|[^а-яё])/ig,' ').replace(/неч[её]тн(?:ая|ой)?|ч[её]тн(?:ая|ой)?|нижн(?:яя|ей)?|верхн(?:яя|ей)?/ig,' ').replace(/\b(20\d{2}[-.]\d{1,2}[-.]\d{1,2}|\d{1,2}[.]\d{1,2}[.]20\d{2})\b/g,' ').replace(/^\s*\d+[.)]?\s*/,'').trim();
      const parts=rest.split(/\s*[|;]\s*|\s*,\s*/).filter(Boolean);
      let subj=(parts[0]||rest||'Занятие').replace(/^(предмет|дисциплина)\s*[:\-]\s*/i,'').trim();
      const roomMatch=rest.match(/(?:ауд\.?|каб\.?|кабинет|корпус)\s*([А-ЯA-Z0-9\-\/]+)/i);
      const teacherMatch=rest.match(/(?:преподаватель|преп\.?)\s*[:\-]?\s*([^,;|]+)/i);
      if(!subj||subj.length>180)subj='Занятие';
      out.push({id:id(),day,date,week,cycleIndex,subj,s,e:eTime,room:roomMatch?roomMatch[1]:(parts[1]||''),teacher:teacherMatch?teacherMatch[1].trim():(parts[2]||'')});
    });
    return out;
  }

  function splitCsvLine(line,delimiter) {
    const out=[];let value='',quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'&&line[i+1]==='"'&&quoted){value+='"';i++}
      else if(ch==='"')quoted=!quoted;
      else if(ch===delimiter&&!quoted){out.push(value.trim());value=''}
      else value+=ch;
    }
    out.push(value.trim());return out;
  }
  function groupLabel(value) {
    const raw=String(value||'').replace(/\s+/g,' ').trim();
    if(!raw)return '';
    const explicit=raw.match(/^(?:группа|гр\.?)\s*[:№#-]?\s*(.+)$/i);
    if(explicit&&explicit[1])return explicit[1].trim();
    if(/^[А-ЯЁ]{1,7}\s*[-–]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?[А-ЯЁ]?$/i.test(raw))return raw.replace(/\s+/g,'').replace(/–/g,'-');
    if(/^\d{1,3}\s*[-–]\s*[А-ЯЁ]{1,7}(?:\s*[-–]\s*\d{1,3})?$/i.test(raw))return raw.replace(/\s+/g,'').replace(/–/g,'-');
    if(/^[А-ЯЁ]{1,5}\d{2,4}[А-ЯЁ]?(?:[-–]\d{1,3})?$/i.test(raw))return raw;
    return '';
  }
  function parseRows(rows,options) {
    options=options||{};
    const matrix=(rows||[]).map(row=>Array.isArray(row)?row.map(x=>String(x==null?'':x).trim()):[String(row||'').trim()]);
    const records=[],seen=new Set();
    const add=r=>{
      if(!r||!r.subj||!r.s||!r.e)return;
      if(!r.group&&options.defaultGroup)r.group=options.defaultGroup;
      const key=[r.group,r.date,r.day,r.week,r.cycleIndex,r.subj,r.s,r.e,r.room,r.teacher].join('|');
      if(!seen.has(key)){seen.add(key);records.push(r)}
    };
    const groupHeader=(()=>{
      for(let i=0;i<Math.min(matrix.length,12);i++){
        const cols=matrix[i].map((cell,col)=>({group:groupLabel(cell),col})).filter(x=>x.group);
        const rowText=matrix[i].join(' ').toLowerCase();
        if(cols.length>=2||(cols.length===1&&(/время|time|день недели|^день\b/.test(rowText))))return {row:i,cols};
      }
      return null;
    })();
    if(groupHeader){
      let contextDay=null,contextWeek='',lastTime='';
      for(let i=groupHeader.row+1;i<matrix.length;i++){
        const row=matrix[i],lower=row.join(' ').toLowerCase();
        for(const [name,n] of Object.entries(DAY_NAMES)){if(new RegExp('(^|[^а-яё])'+name+'(?=$|[^а-яё])','i').test(lower)){contextDay=n;break}}
        if(/неч[её]тн|нижн/.test(lower))contextWeek='odd';else if(/ч[её]тн|верхн/.test(lower))contextWeek='even';else if(/постоян/.test(lower))contextWeek='fixed';
        const timeCell=row.find(x=>timeRegex.test(x||''))||'';
        if(timeCell)lastTime=timeCell;
        const time=timeCell||lastTime;
        if(!row.some(Boolean))continue;
        for(const col of groupHeader.cols){
          const cell=row[col.col];if(!cell||groupLabel(cell))continue;
          const parsed=parseLine(time&&!timeRegex.test(cell)?cell+' '+time:cell,{day:contextDay,week:contextWeek});
          parsed.forEach(r=>add({...r,group:col.group}));
        }
      }
      if(records.length)return records;
    }
    const headerRows=matrix.map((row,index)=>({row,index})).filter(({row})=>{
      const h=row.map(x=>x.toLowerCase());
      return h.some(x=>/день недели|^день$|^weekday$|^day$/.test(x)) &&
        h.some(x=>/предмет|дисциплина|занятие|subject|class/.test(x)) &&
        h.some(x=>/время|time|начало|start/.test(x));
    });
    if(headerRows.length){
      for(let hi=0;hi<headerRows.length;hi++){
        const headerIndex=headerRows[hi].index,nextHeader=headerRows[hi+1]?.index??matrix.length;
        const h=matrix[headerIndex].map(x=>x.toLowerCase()),find=rx=>h.findIndex(x=>rx.test(x));
        const di=find(/день недели|^день$|^weekday$|^day$/),si=find(/предмет|дисциплина|занятие|subject|class/);
        const ti=find(/время|time/),bi=find(/начало|start/),ei=find(/конец|end|окончание/);
        const ri=find(/ауд|кабинет|room|место/),pi=find(/препод|teacher/),wi=find(/недел|week/),dti=find(/дата|date/),gi=find(/групп|group/);
        let currentGroup=options.defaultGroup||'';
        for(let k=0;k<headerIndex;k++){const g=matrix[k].map(groupLabel).find(Boolean);if(g)currentGroup=g}
        for(let i=headerIndex+1;i<nextHeader;i++){
          const row=matrix[i];if(!row.some(Boolean))continue;
          const day=DAY_NAMES[(row[di]||'').toLowerCase()];
          const titleGroup=row.map(groupLabel).find(Boolean);
          if(titleGroup&&(day==null||!row[si])){currentGroup=titleGroup;continue}
          const groupValue=gi>=0?groupLabel(row[gi])||String(row[gi]||'').trim():'';
          if(groupValue)currentGroup=groupValue;
          const time=(ti>=0?row[ti]:'')||'',m=time.match(timeRegex);
          const s0=bi>=0?normalizeClock(row[bi]):m?normalizeTime(m[1],m[2]):'';
          const eTime=ei>=0?normalizeClock(row[ei]):m?normalizeTime(m[3],m[4]):'';
          let week='',cycleIndex=null;
          const w=(wi>=0?row[wi]||'':'').toLowerCase();
          if(/неч[её]тн|нижн/.test(w))week='odd';else if(/ч[её]тн|верхн/.test(w))week='even';else if(/постоян/.test(w))week='fixed';
          const cm=w.match(/(?:цикл|недел[яи])\s*([1-4])/);if(cm)cycleIndex=Number(cm[1])-1;
          const date=dti>=0?parseDate(row[dti]):'';
          if(day!=null&&row[si]&&s0&&eTime&&eTime>s0)add({id:id(),day,date,week,cycleIndex,group:currentGroup,subj:row[si],s:s0,e:eTime,room:ri>=0?row[ri]||'':'',teacher:pi>=0?row[pi]||'':''});
        }
      }
      if(records.length)return records;
    }
    let dayColumns=null,dayHeaderRow=-1;
    for(let i=0;i<Math.min(matrix.length,8);i++){
      const cols=matrix[i].map((cell,col)=>({day:DAY_NAMES[cell.toLowerCase()],col})).filter(x=>x.day!=null);
      if(cols.length>=2){dayColumns=cols;dayHeaderRow=i;break}
    }
    if(dayColumns){
      let currentGroup=options.defaultGroup||'';
      for(let k=0;k<dayHeaderRow;k++){const g=matrix[k].map(groupLabel).find(Boolean);if(g)currentGroup=g}
      for(let i=dayHeaderRow+1;i<matrix.length;i++){
        const row=matrix[i],rowText=row.join(' '),groupTitle=row.map(groupLabel).find(Boolean);
        if(groupTitle&&!timeRegex.test(rowText)){currentGroup=groupTitle;continue}
        const timeCell=row.find(x=>timeRegex.test(x||''));if(!timeCell)continue;
        const w=row.join(' ').toLowerCase(),week=/неч[её]тн|нижн/.test(w)?'odd':/ч[её]тн|верхн/.test(w)?'even':'';
        dayColumns.forEach(({day,col})=>{const cell=row[col];if(cell)parseLine(cell+' '+timeCell,{day,week}).forEach(r=>add({...r,group:currentGroup}))});
      }
      if(records.length)return records;
    }
    let contextDay=null,contextWeek='',currentGroup=options.defaultGroup||'';
    for(const row of matrix){
      const joined=row.filter(Boolean).join(' | '),lower=joined.toLowerCase(),groupTitle=row.map(groupLabel).find(Boolean);
      if(groupTitle&&!timeRegex.test(joined)&&!Object.keys(DAY_NAMES).some(name=>new RegExp('(^|[^а-яё])'+name+'(?=$|[^а-яё])','i').test(lower))){currentGroup=groupTitle;continue}
      for(const [name,n] of Object.entries(DAY_NAMES)){if(new RegExp('(^|[^а-яё])'+name+'(?=$|[^а-яё])','i').test(lower)){contextDay=n;break}}
      if(/неч[её]тн|нижн/.test(lower))contextWeek='odd';else if(/ч[её]тн|верхн/.test(lower))contextWeek='even';
      parseLine(joined,{day:contextDay,week:contextWeek}).forEach(r=>add({...r,group:currentGroup}));
    }
    return records;
  }

  function normalizeClock(value) {
    const m=String(value||'').match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
    return m?normalizeTime(m[1],m[2]):'';
  }
  function parseDate(value) {
    const v=String(value||'').trim();
    let m=v.match(/^(20\d{2})[-.](\d{1,2})[-.](\d{1,2})$/);
    if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
    m=v.match(/^(\d{1,2})[.](\d{1,2})[.](20\d{2})$/);
    return m?m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):'';
  }
  function positionedItemsToRows(items) {
    const clean=(items||[]).filter(x=>x&&String(x.text||'').trim()&&Number.isFinite(Number(x.x))&&Number.isFinite(Number(x.y))).map(x=>({x:Number(x.x),y:Number(x.y),w:Math.max(0,Number(x.width)||0),text:String(x.text).trim()}));
    clean.sort((a,b)=>a.y-b.y||a.x-b.x);
    const lines=[];
    clean.forEach(item=>{
      let line=lines.findLast?lines.findLast(x=>Math.abs(x.y-item.y)<=4):[...lines].reverse().find(x=>Math.abs(x.y-item.y)<=4);
      if(!line){line={y:item.y,items:[]};lines.push(line)}
      line.items.push(item);
    });
    return lines.map(line=>{
      const cells=[];
      line.items.sort((a,b)=>a.x-b.x).forEach(item=>{
        const last=cells[cells.length-1];
        if(!last||item.x-last.right>30)cells.push({text:item.text,right:item.x+item.w});
        else {last.text+=' '+item.text;last.right=Math.max(last.right,item.x+item.w)}
      });
      return cells.map(x=>x.text.trim());
    }).filter(row=>row.some(Boolean));
  }

  async function extractFile(file) {
    const name=file.name||'schedule',ext=(name.split('.').pop()||'').toLowerCase();
    let records=[];
    if(['csv','txt'].includes(ext)){
      const text=await file.text(),first=text.split(/\r?\n/).find(x=>x.trim())||'',delimiter=first.includes(';')?';':first.includes('\t')?'\t':',';
      const rows=text.split(/\r?\n/).map(line=>splitCsvLine(line,delimiter));
      records=parseRows(rows);
      if(!records.length)records=text.split(/\r?\n/).flatMap(line=>parseLine(line,{day:null,week:''}));
    } else if(['xlsx','xls'].includes(ext)){
      await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',()=>!!window.XLSX);
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
      wb.SheetNames.forEach(sheetName=>{
        const defaultGroup=groupLabel(sheetName);
        records.push(...parseRows(XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:''}),{defaultGroup}));
      });
    } else if(ext==='docx'){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js',()=>!!window.mammoth);
      const res=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
      records=parseRows(res.value.split(/\r?\n/).map(x=>[x]));
      if(!records.length)records=res.value.split(/\r?\n/).flatMap(line=>parseLine(line,{day:null,week:''}));
    } else if(ext==='pdf'){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',()=>!!window.pdfjsLib);
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let rows=[],fallback=[];
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p),tc=await page.getTextContent();
        fallback.push(tc.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('').split(/\r?\n/).filter(Boolean).join('\n'));
        rows.push(...positionedItemsToRows(tc.items.map(x=>({x:x.transform&&x.transform[4],y:x.transform&&x.transform[5],width:x.width,text:x.str}))));
      }
      records=parseRows(rows);
      if(!records.length)records=parseRows(fallback.map(x=>[x]));
    } else if(['jpg','jpeg','png'].includes(ext)){
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',()=>!!window.Tesseract);
      const result=await Tesseract.recognize(file,'rus+eng',{logger:m=>{if(importDraft)importDraft.status=m.status==='recognizing text'?'Распознаю изображение…':'Подготавливаю распознавание…';}});
      const rows=positionedItemsToRows((result.data.words||[]).map(x=>({x:x.bbox&&x.bbox.x0,y:x.bbox&&x.bbox.y0,width:x.bbox?x.bbox.x1-x.bbox.x0:0,text:x.text})));
      records=parseRows(rows);
      if(!records.length)records=parseRows(result.data.text.split(/\r?\n/).map(x=>[x]));
    } else throw new Error('Формат файла не поддерживается.');
    const groups=[...new Set(records.map(r=>r.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    return {records,groups};
  }

  function renderImportPreview() {
    return window.vMore();
  }
  async function readFile(input) {
    const file=input&&input.files&&input.files[0];if(!file)return;
    if(file.size>15*1024*1024){importDraft.status='Файл больше 15 МБ. Уменьши его или выбери более лёгкую копию.';render();return}
    importDraft=importDraft||{records:[],groups:[],selectedGroup:'',target:'study',mode:'auto',replace:false,filename:'',status:''};
    importDraft.filename=file.name;importDraft.status='Читаю файл и ищу расписания групп…';importDraft.records=[];importDraft.groups=[];importDraft.selectedGroup='';render();
    try{
      const result=await extractFile(file);
      importDraft.records=result.records.slice(0,2000);
      importDraft.groups=result.groups;
      importDraft.selectedGroup=result.groups.includes(S.settings.studyGroup||'')?(S.settings.studyGroup||''):'';
      importDraft.sourceType=result.groups.length?'university':'';
      if(result.groups.length)importDraft.status='Найдено групп: '+result.groups.length+'. Выбери свою группу: чужие занятия в импорт не попадут.';
      else importDraft.status=result.records.length?'Группы не обнаружены. Похоже, файл содержит личное расписание. Проверь предпросмотр.':'Не удалось уверенно распознать расписание. Проверь формат файла или используй Excel/CSV с названиями групп в заголовках.';
      if(result.records.some(x=>x.week))importDraft.mode='alternating';
    }catch(err){importDraft.status='Ошибка чтения: '+(err&&err.message||'неизвестная ошибка');}
    render();
  }

  function setDraft(key,value){if(importDraft){importDraft[key]=value;if(key==='selectedGroup')render()}}
  async function loadSample(){try{const response=await fetch('./sample-university-schedule.csv',{cache:'no-store'});if(!response.ok)throw new Error('Не удалось загрузить тестовый файл.');const blob=await response.blob();const file=new File([blob],'sample-university-schedule.csv',{type:'text/csv'});await readFile({files:[file]})}catch(err){alert(err.message||'Ошибка загрузки примера.')}}

  
  function editDraft(index) {
    const r=importDraft&&importDraft.records[index];if(!r)return;
    sheet('<h1>Проверить занятие</h1><label for="di-subj">Предмет / название</label><input id="di-subj" value="'+esc(r.subj)+'"><label for="di-day">День недели</label><select id="di-day"><option value="0" '+(r.day==null?'selected':'')+'>Выбрать день</option>'+[1,2,3,4,5,6].map(d=>'<option value="'+d+'" '+(Number(r.day)===d?'selected':'')+'>'+DAYS_SHORT[d]+'</option>').join('')+'</select><label for="di-week">Неделя</label><select id="di-week"><option value="" '+(!r.week?'selected':'')+'>По умолчанию</option><option value="odd" '+(r.week==='odd'?'selected':'')+'>Нижняя / нечётная</option><option value="even" '+(r.week==='even'?'selected':'')+'>Верхняя / чётная</option><option value="fixed" '+(r.week==='fixed'?'selected':'')+'>Постоянная</option></select><label for="di-cycle">Неделя цикла</label><select id="di-cycle">'+[0,1,2,3].map(n=>'<option value="'+n+'" '+(Number(r.cycleIndex||0)===n?'selected':'')+'>Неделя '+(n+1)+'</option>').join('')+'</select><div class="row"><div class="grow"><label for="di-start">Начало</label><input id="di-start" type="time" value="'+esc(r.s)+'"></div><div class="grow"><label for="di-end">Конец</label><input id="di-end" type="time" value="'+esc(r.e)+'"></div></div><label for="di-room">Аудитория / место</label><input id="di-room" value="'+esc(r.room)+'"><label for="di-teacher">Преподаватель / заметка</label><input id="di-teacher" value="'+esc(r.teacher)+'"><label for="di-date">Конкретная дата (если есть)</label><input id="di-date" type="date" value="'+esc(r.date||'')+'"><div class="schedule-actions"><button class="btn" onclick="MYDAY_LAB.saveDraftItem('+index+')">Сохранить</button><button class="btn g" onclick="MYDAY_LAB.removeDraftItem('+index+')">Убрать строку</button></div>');
  }
  function saveDraftItem(i) {
    const r=importDraft.records[i];if(!r)return;
    const s=document.querySelector('#di-start').value,eTime=document.querySelector('#di-end').value;
    if(!s||!eTime||eTime<=s){alert('Проверь время начала и окончания.');return}
    Object.assign(r,{subj:document.querySelector('#di-subj').value.trim(),day:Number(document.querySelector('#di-day').value),week:document.querySelector('#di-week').value,cycleIndex:Number(document.querySelector('#di-cycle').value),s,e:eTime,room:document.querySelector('#di-room').value.trim(),teacher:document.querySelector('#di-teacher').value.trim(),date:document.querySelector('#di-date').value});
    close_();render();
  }
  function removeDraftItem(i){importDraft.records.splice(i,1);close_();render()}
  function applyImport() {
    const d=importDraft;if(!d||!d.records.length){alert('Сначала распознай файл.');return}
    if(d.groups&&d.groups.length&&!d.selectedGroup){alert('Сначала выбери свою учебную группу.');return}
    if((!d.groups||!d.groups.length)&&d.sourceType!=='personal'){alert('Сначала подтверди, что это личное расписание. Если это общее расписание университета, выбери тип «Общее» и загрузи файл с распознаваемыми группами.');return}
    const selectedRecords=d.groups&&d.groups.length?d.records.filter(r=>r.group===d.selectedGroup):d.records;
    if(!selectedRecords.length){alert('Для выбранной группы не найдено занятий. Выбери другую группу или проверь файл.');return}
    if(selectedRecords.some(x=>!Number.isInteger(Number(x.day))||Number(x.day)<1||Number(x.day)>6)){alert('Укажи день недели для каждой распознанной записи. Нераспознанные строки не будут добавлены наугад.');return}
    const target=d.target||'study',mode=d.mode==='auto'?(selectedRecords.some(x=>x.week)?'alternating':'fixed'):d.mode;
    if(target==='study'&&mode==='dates'&&selectedRecords.some(x=>!x.date)){alert('В режиме конкретных дат у каждой записи должна быть дата. Открой строки без даты и укажи её.');return}
    if(d.replace&&!confirm('Заменить существующие записи в выбранных днях? Это действие нельзя отменить.'))return;
    if(target==='study'){
      cfg().studyMode=mode;
      if(d.selectedGroup)S.settings.studyGroup=d.selectedGroup;
    }
    const changed=new Set(),cleared=new Set();
    selectedRecords.forEach(r=>{
      if(!r.subj||!r.s||!r.e||r.e<=r.s)return;
      let key='work';
      if(target==='study'){
        if(mode==='fixed')key='fixed';
        else if(mode==='dates')key='date:'+r.date;
        else if(mode==='cycle')key='cycle:'+(Number(r.cycleIndex)||0);
        else if(mode==='hybrid')key=r.week==='odd'||r.week==='even'?r.week:'fixed';
        else key=r.week==='odd'||r.week==='even'?r.week:wk();
      }
      const bucket=scheduleBucket(target,key),day=Number(r.day),slot=key+'|'+day;
      if(!bucket[day])bucket[day]=[];
      if(d.replace&&!cleared.has(slot)){bucket[day]=[];cleared.add(slot)}
      bucket[day].push({id:id(),subj:r.subj,s:r.s,e:r.e,room:r.room||'',teacher:r.teacher||''});
      changed.add(key+'|'+day);
    });
    if(!changed.size){alert('В выбранной группе нет готовых строк с предметом, днём и временем. Проверь предпросмотр.');return}
    save();importDraft.status='Импортировано записей: '+selectedRecords.length+' · группа: '+(d.selectedGroup||'личное расписание');importDraft=null;st=null;tab='sched';schedSpace=target;render();
  }

  function setStudyMode(mode){if(!['alternating','fixed','cycle','dates','hybrid'].includes(mode))return;cfg().studyMode=mode;if(mode==='cycle'&&!cfg().cycleAnchor)cfg().cycleAnchor=mondayOf(today());save();render()}
  function setCycleWeeks(n){cfg().cycleWeeks=Math.max(2,Math.min(4,Number(n)||2));save();render()}
  function setCycleAnchor(d){if(d)cfg().cycleAnchor=mondayOf(d);save();render()}
  function setLayer(layer){st=layer;render()}
  function selectDate(date){if(!date)return;const d=fromIso(date);cfg().selectedDate=d.getDay()===0?shiftDate(date,1):date;sd=fromIso(cfg().selectedDate).getDay()||1;st=null;save();render()}
  function setWorkMode(mode){S.workConfig.mode=mode==='rotation'?'rotation':'weekly';save();render()}
  function setWorkPreset(pattern){const c=S.workConfig;c.pattern=[...pattern].map(x=>x==='Р'?'work':'off');const el=document.querySelector('#work-pattern');if(el)el.value=pattern}
  function saveWorkSettings(){
    const pattern=(document.querySelector('#work-pattern')?.value||'РРВВ').toUpperCase().replace(/\s/g,'');
    if(!pattern||pattern.length>28||!/^[РВ10]+$/.test(pattern)){alert('Цикл должен состоять из Р и В (или 1 и 0), например РРВВ.');return}
    const start=document.querySelector('#work-start').value,end=document.querySelector('#work-end').value;
    if(!start||!end||end<=start){alert('Проверь время смены.');return}
    Object.assign(S.workConfig,{mode:'rotation',pattern:[...pattern].map(x=>x==='Р'||x==='1'?'work':'off'),anchorDate:document.querySelector('#work-anchor').value||today(),title:document.querySelector('#work-title').value.trim()||'Рабочая смена',start,end,exceptions:S.workConfig.exceptions||{}});
    save();st=null;render();
  }
  function selectWorkDate(date){S.workConfig.selectedDate=date;save();render()}
  function toggleWorkException(date){
    const c=S.workConfig,has=!!workShiftForDate(date);
    c.exceptions[date]=has?'off':{off:false,title:c.title||'Рабочая смена',start:c.start||'09:00',end:c.end||'18:00'};
    save();render();
  }
  function toggleNotification(key,value){S.settings.notifications=S.settings.notifications||{study:true,work:true,personal:true};S.settings.notifications[key]=!!value;save();render()}
  function toggleWidget(key,value){S.settings.dashboard[key]=!!value;save();render()}
  function moveWidget(index,delta){const a=S.settings.dashboardOrder,j=index+delta;if(j<0||j>=a.length)return;[a[index],a[j]]=[a[j],a[index]];save();render()}
  function addHabit(){const name=document.querySelector('#habit-name').value.trim();if(!name)return;S.habits.push({id:id(),name,log:{}});save();render()}
  function toggleHabit(hid){const h=S.habits.find(x=>x.id===hid);if(!h)return;h.log=h.log||{};h.log[today()]?delete h.log[today()]:h.log[today()]=true;save();render()}
  function deleteHabit(hid){S.habits=S.habits.filter(x=>x.id!==hid);save();render()}

  function dashboardCards() {
    const c=S.settings.dashboard||{},order=S.settings.dashboardOrder||[];
    return order.filter(k=>c[k]).map(k=>{
      if(k==='workShift'){
        const shift=workShiftForDate(today());
        return '<section class="surface-panel dashboard-lab-card"><div class="section-head"><div><h2>Работа сегодня</h2><p class="section-caption">'+(shift?'Рабочая смена':'По графику выходной')+'</p></div><button class="text-link" onclick="go(\'sched\');schedSpace=\'work\';render()">План</button></div>'+(shift?'<b>'+esc(shift.subj)+'</b><p class="page-sub">'+shift.s+'–'+shift.e+'</p>':'<p class="page-sub">Смена не запланирована.</p>')+'</section>';
      }
      if(k==='habits'){
        const list=S.habits||[];
        return '<section class="surface-panel dashboard-lab-card"><div class="section-head"><div><h2>Привычки</h2><p class="section-caption">'+list.filter(h=>h.log&&h.log[today()]).length+' из '+list.length+' сегодня</p></div><button class="text-link" onclick="go(\'more\');st=\'habits\';render()">Открыть</button></div>'+(list.length?list.slice(0,4).map(h=>'<label class="lab-check"><input type="checkbox" '+(h.log&&h.log[today()]?'checked':'')+' onchange="MYDAY_LAB.toggleHabit(\''+h.id+'\')"> '+esc(h.name)+'</label>').join(''):'<p class="page-sub">Добавь привычки в настройках.</p>')+'</section>';
      }
      if(k==='notes') return '<section class="surface-panel dashboard-lab-card"><div class="section-head"><div><h2>Идеи и заметки</h2><p class="section-caption">'+S.inbox.length+' записей</p></div><button class="text-link" onclick="go(\'more\');st=\'inbox\';render()">Открыть</button></div><button class="btn g" onclick="capture()">Быстрая запись</button></section>';
      return '';
    }).join('');
  }

  const labStyle=document.createElement('style');labStyle.textContent='.lab-tools{margin-top:24px}.lab-mode-list{display:grid;gap:8px;margin-top:14px}.lab-mode-item{padding:12px;border:1px solid var(--line);border-radius:14px;display:grid;gap:4px}.lab-mode-item.active{border-color:var(--accent);background:var(--accent-soft)}.lab-mode-item span,.import-drop .page-sub{font-size:13px;color:var(--muted)}.lab-date-row{align-items:center;gap:12px;margin:12px 0}.lab-date-row label{flex:1;margin:0}.lab-date-row input{max-width:180px}.import-drop{position:relative;display:grid;justify-items:center;gap:8px;padding:22px;border:1px dashed var(--line-strong);border-radius:18px;text-align:center;margin-bottom:12px}.import-drop input{width:100%;max-width:100%;font-size:14px}.lab-check{display:flex;align-items:center;gap:10px;margin:14px 0}.lab-check input{width:18px;height:18px}.import-row{width:100%;text-align:left;background:transparent;border:0}.work-shift-card{display:grid;gap:8px;padding:16px;margin-top:14px;border-radius:16px;background:var(--accent-soft)}.work-shift-card strong{font-size:24px}.settings-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}.dashboard-lab-card{margin-top:12px}.dashboard-lab-card .lab-check{margin:8px 0}';document.head.appendChild(labStyle);

  const baseSched=window.vSched;
  window.vSched=function(){
    if(schedSpace==='work'&&S.workConfig&&S.workConfig.mode==='rotation')return renderWorkRotationPage();
    return renderSchedulePage();
  };
  const baseToday=window.vToday;
  window.vToday=function(){let html=baseToday();const cards=dashboardCards();return cards?html.replace('</main>',cards+'</main>'):html};
  const baseMore=window.vMore;
  window.vMore=function(){
    if(st==='schedule-settings')return renderScheduleSettings();
    if(st==='schedule-import')return renderImportPage();
    if(st==='work-shifts')return renderWorkSettings();
    if(st==='personalize')return renderPersonalize();
    if(st==='habits')return renderHabits();
    if(st==='cal')return renderCalendar();
    return injectTools(baseMore());
  };

  window.MYDAY_LAB={
    readFile, setDraft, loadSample, editDraft, saveDraftItem, removeDraftItem, applyImport, clearDraft(){importDraft=null;render()},
    setStudyMode,setCycleWeeks,setCycleAnchor,setLayer,selectDate,selectWorkDate,setWorkMode,setWorkPreset,saveWorkSettings,toggleWorkException,
    toggleNotification,toggleWidget,moveWidget,addHabit,toggleHabit,deleteHabit,workShiftForDate,workShiftList,parseRows,parseLine
  };
  window.MYDAY_LAB_VERSION=LAB_VERSION;
  window.render();
})();