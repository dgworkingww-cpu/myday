/* MYDAY Apple-inspired 2026 interaction layer.
   Rebuilds the interface while intentionally keeping the existing data and domain actions. */
const MYDAY_LEGACY_MORE = window.vMore;
const MYDAY_ICONS = {
 today:'<path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>',
 sched:'<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M7 3v4m10-4v4M4 10h16M8 14h3m3 0h2"/>',
 tasks:'<path d="M8 6h12M8 12h12M8 18h12"/><path d="m3.5 6 .8.8L5.8 5m-2.3 7 .8.8 1.5-1.8m-2.3 7 .8.8 1.5-1.8"/>',
 study:'<path d="M4 5.5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 7v12"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 search:'<circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 book:'<path d="M4 5.5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 7v12"/>',
 calendar:'<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M7 3v4m10-4v4M4 10h16"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1 1.8-1.7 2.9-2.1-.5a7.7 7.7 0 0 1-1.7 1l-.5 2.1h-3.3l-.5-2.1a7.7 7.7 0 0 1-1.7-1l-2.1.5-1.7-2.9 1.1-1.8a7.7 7.7 0 0 1 0-2l-1.1-1.8 1.7-2.9 2.1.5a7.7 7.7 0 0 1 1.7-1l.5-2.1h3.3l.5 2.1a7.7 7.7 0 0 1 1.7 1l2.1-.5 1.7 2.9-1.1 1.8a7.7 7.7 0 0 1 0 2Z"/>',
 uni:'<path d="m3 9 9-5 9 5v2H3z"/><path d="M5 11v8m4-8v8m6-8v8m4-8v8M3 21h18"/>',
 stats:'<path d="M4 20V10m5 10V5m5 15v-7m5 7V3"/>',
 inbox:'<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8m-8 4h5"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
function mydayIcon(name,size=20){
 return '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(MYDAY_ICONS[name]||MYDAY_ICONS.more)+'</svg>';
}
function mydayHeader(title,subtitle,actions=true){
 return '<header class="page-top"><div class="page-top-copy"><div class="eyebrow">MYDAY · ЛИЧНЫЙ ПЛАНЕР</div><h1 class="page-title">'+title+'</h1>'+(subtitle?'<p class="page-sub">'+subtitle+'</p>':'')+'</div>'+(actions?'<div class="page-actions"><button class="icon-btn" type="button" aria-label="Поиск" onclick="search()">'+mydayIcon('search')+'</button><button class="icon-btn" type="button" aria-label="Быстрая запись" onclick="capture()">'+mydayIcon('plus')+'</button></div>':'')+'</header>';
}
function mydaySection(title,caption,action){
 return '<div class="section-head"><div class="section-head-copy"><h2>'+title+'</h2>'+(caption?'<p class="section-caption">'+caption+'</p>':'')+'</div>'+(action||'')+'</div>';
}
function mydayTask(x){
 const k=x.k||'t',done=x.status==2,late=!!(x.due&&x.due<today()&&!done);
 const due=x.due?fmt(x.due):'Без срока';
 const meta=[due,x.cat||'',x.prio==2?'Высокий приоритет':''].filter(Boolean).join(' · ');
 return '<div class="task-item"><button class="task-check '+(done?'on':'')+'" aria-label="'+(done?'Вернуть в активные':'Отметить выполненным')+': '+e(x.title)+'" aria-pressed="'+done+'" onclick="tog(\''+k+'\',\''+x.id+'\')">'+mydayIcon('check',14)+'</button><button class="task-main" style="border:0;background:transparent;text-align:left;padding:0" onclick="detail(\''+k+'\',\''+x.id+'\')"><span class="task-title '+(done?'done':'')+'">'+e(x.title)+'</span><span class="task-meta"><span class="'+(late?'late':'')+'">'+e(meta)+'</span></span></button><span class="task-chevron" aria-hidden="true">›</span></div>';
}
function mydayEmpty(title,caption){
 return '<div class="empty-state"><b>'+title+'</b><span>'+caption+'</span></div>';
}
function mydayTimeline(lessonsList,current){
 if(!lessonsList.length)return mydayEmpty('Сегодня занятий нет','Можно оставить день свободным или добавить событие в расписание.');
 return '<div class="timeline-list">'+lessonsList.map(l=>'<button class="timeline-item '+(current&&current.id==l.id?'current':'')+'" style="width:100%;border:0;background:transparent;text-align:left" onclick="lessonDay(\''+l.id+'\',\''+today()+'\')"><span class="timeline-time">'+l.s+'</span><span class="timeline-rail"><i class="timeline-dot"></i></span><span class="timeline-content"><b class="timeline-title">'+e(l.subj)+'</b><span class="timeline-meta"><span>'+l.s+'–'+l.e+'</span><span>'+e(roomOf(l))+'</span></span></span></button>').join('')+'</div>';
}
window.vToday=function(){
 const n=new Date(),t=today(),L=lessons(n),all=allOpen();
 const hm=pad(n.getHours())+':'+pad(n.getMinutes()),current=L.find(l=>l.s<=hm&&l.e>hm);
 const overdue=all.filter(x=>x.due&&x.due<t),due=all.filter(x=>x.due==t),work=due.filter(x=>(x.space||'personal')==='work');
 const todayTasks=due.filter(x=>(x.space||'personal')!=='work');
 const done=S.done.filter(x=>x===t).length,total=todayTasks.length+done,pct=total?Math.round(done/total*100):0;
 const greeting=n.getHours()<5?'Доброй ночи':n.getHours()<12?'Доброе утро':n.getHours()<18?'Добрый день':'Добрый вечер';
 const date=n.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
 const soon=all.filter(x=>x.due&&x.due>t&&x.due<=addDays(t,3)).slice(0,3);
 return '<main class="page">'+mydayHeader(greeting+',',date)+
 '<section class="hero-card"><div class="hero-copy"><div class="hero-kicker">ВАШ ПЛАН НА СЕГОДНЯ</div><div class="hero-title">'+(current?'Сейчас: '+e(current.subj):L.length?L.length+' '+ruCount(L.length,'занятие','занятия','занятий')+' сегодня':'День без спешки')+'</div><p class="hero-note">'+(current?'Идёт занятие до '+current.e:total?'Выполнено '+done+' из '+total+' задач на сегодня':'Всё важное собрано в одном месте. Остальное можно не держать в голове.')+'</p></div><div class="hero-orb">'+mydayIcon('today',34)+'</div></section>'+
 '<div class="metric-grid"><div class="metric-tile"><span class="metric-label">Занятия</span><b class="metric-value">'+L.length+'</b></div><div class="metric-tile"><span class="metric-label">На сегодня</span><b class="metric-value">'+todayTasks.length+'</b></div><div class="metric-tile"><span class="metric-label">Просрочено</span><b class="metric-value '+(overdue.length?'danger':'')+'">'+overdue.length+'</b></div></div>'+
 '<div class="today-grid"><section class="today-panel">'+mydaySection('Расписание',L.length?L.length+' занятий · '+wkName(wk()):'План дня')+(current?'<div class="current-callout"><b>Сейчас идёт: '+e(current.subj)+'</b><span>До '+current.e+' · '+e(roomOf(current))+'</span></div>':'')+mydayTimeline(L,current)+
 '<button class="btn g" style="width:100%;margin-top:8px" onclick="go(\'sched\')">Открыть расписание '+mydayIcon('chevron',16)+'</button></section>'+
 '<aside class="today-right"><section class="today-panel">'+mydaySection('Задачи на сегодня',todayTasks.length?todayTasks.length+' осталось выполнить':'Можно добавить первое дело','<button class="text-link" onclick="go(\'tasks\')">Все задачи</button>')+
 (todayTasks.length?'<div class="task-list">'+todayTasks.map(mydayTask).join('')+'</div>':mydayEmpty('Пока чисто','Добавь задачу, чтобы не забыть её позже.'))+
 '<div class="quick-add"><input id="qa" aria-label="Быстро добавить задачу" placeholder="Добавить задачу…" onkeydown="if(event.key===\'Enter\')qadd()"><button aria-label="Добавить задачу" onclick="qadd()">'+mydayIcon('plus',18)+'</button></div></section>'+
 (work.length?'<section class="today-panel">'+mydaySection('Работа',work.length+' дела на сегодня')+'<div class="task-list">'+work.map(mydayTask).join('')+'</div></section>':'')+
 (overdue.length?'<section class="today-panel">'+mydaySection('Просрочено',overdue.length+' задач требуют внимания')+'<div class="task-list">'+overdue.slice(0,4).map(mydayTask).join('')+'</div></section>':'')+
 (soon.length?'<section class="today-panel">'+mydaySection('Скоро дедлайны','Ближайшие 3 дня')+'<div class="task-list">'+soon.map(mydayTask).join('')+'</div></section>':'')+'</aside></div></main>';
};
window.vSched=function(){
 const space=schedSpace==='work'?'work':'study',week=space==='work'?'work':(st==='odd'||st==='even'?st:wk());
 const bucket=scheduleBucket(space,week),days=[1,2,3,4,5,6],list=(bucket[sd]||[]).slice().sort((a,b)=>a.s.localeCompare(b.s));
 const todayDay=new Date().getDay();
 const dayHtml=days.map(d=>'<button class="day-pill '+(sd===d?'on ':'')+(todayDay===d?'today':'')+'" aria-pressed="'+(sd===d)+'" onclick="sd='+d+';render()"><strong>'+['','Пн','Вт','Ср','Чт','Пт','Сб'][d]+'</strong><small>'+((bucket[d]||[]).length?((bucket[d]||[]).length+' дел'):'Свободно')+'</small></button>').join('');
 return '<main class="page">'+mydayHeader('Расписание','Пары, работа и события по дням недели')+
 '<div class="segmented"><button class="seg-btn '+(space==='study'?'on':'')+'" onclick="schedSpace=\'study\';st=null;render()">Учёба</button><button class="seg-btn '+(space==='work'?'on':'')+'" onclick="schedSpace=\'work\';st=\'work\';render()">Работа</button></div>'+
 '<section class="schedule-control"><div class="schedule-week-label"><span>'+(space==='study'?'Учебная неделя':'Рабочий график')+'</span><b class="week-cycle">'+(space==='study'?wkName(week):'Еженедельный')+'</b></div>'+
 (space==='study'?'<div class="chip-row"><button class="chip '+(week==='odd'?'on':'')+'" onclick="st=\'odd\';render()">Нижняя · нечётная</button><button class="chip '+(week==='even'?'on':'')+'" onclick="st=\'even\';render()">Верхняя · чётная</button></div>':'')+
 '<div class="day-strip">'+dayHtml+'</div></section>'+
 '<div class="schedule-day-head"><div><div class="eyebrow">'+DAYS[sd].toUpperCase()+'</div><h2>'+DAYS[sd]+'</h2><p>'+list.length+' '+ruCount(list.length,'запись','записи','записей')+'</p></div><button class="btn" onclick="lessonForm(\''+week+'\')">'+mydayIcon('plus',16)+' Добавить</button></div>'+
 (list.length?'<section class="schedule-wrap"><div class="timeline-list">'+list.map(l=>'<button class="timeline-item" style="width:100%;border:0;background:transparent;text-align:left" onclick="lessonForm(\''+week+'\',\''+l.id+'\')"><span class="timeline-time">'+l.s+'</span><span class="timeline-rail"><i class="timeline-dot"></i></span><span class="timeline-content"><b class="timeline-title">'+e(l.subj)+'</b><span class="timeline-meta"><span>'+l.s+'–'+l.e+'</span>'+(l.teacher?'<span>'+e(l.teacher)+'</span>':'')+'</span><span class="timeline-room">'+e(roomOf(l))+'</span></span></button>').join('')+'</div></section>':mydayEmpty('Свободный день','Добавь занятие, рабочую смену или встречу.'))+
 '<div class="schedule-actions"><button class="btn g" onclick="bulkForm(\''+week+'\')">Добавить списком</button>'+(space==='study'?'<button class="btn g" onclick="copyForm(\''+week+'\')">Копировать день</button>':'')+'</div></main>';
};
window.vTasks=function(){
 const all=S.tasks.filter(t=>(t.space||'personal')===taskSpace);
 let items=all.filter(t=>(tf.show==='done'?t.status==2:t.status!=2)&&(!tf.cat||t.cat===tf.cat));
 items.sort((a,b)=>tf.show==='done'?(b.doneAt||'').localeCompare(a.doneAt||''):(a.due||'9999').localeCompare(b.due||'9999')||b.prio-a.prio);
 const name=taskSpace==='study'?'Учёба':taskSpace==='work'?'Работа':'Личное',active=all.filter(t=>t.status!==2).length,done=all.length-active;
 const spaces=[['study','Учёба'],['work','Работа'],['personal','Личное']];
 return '<main class="page">'+mydayHeader('Задачи','Все дела в одном месте, без лишних уровней')+
 '<section class="task-overview"><div><div class="eyebrow">'+name.toUpperCase()+'</div><div class="task-overview-number">'+(tf.show==='done'?done:active)+'</div><div class="task-overview-caption">'+(tf.show==='done'?'выполнено':'активных задач')+'</div></div><div class="task-overview-side"><span>Готово</span><b>'+done+'</b><span>Осталось</span><b>'+active+'</b></div><button class="btn" onclick="taskForm()">'+mydayIcon('plus',16)+' Новая задача</button></section>'+
 '<div class="segmented">'+spaces.map(([v,l])=>'<button class="seg-btn '+(taskSpace===v?'on':'')+'" onclick="taskSpace=\''+v+'\';tf.cat=\'\';render()">'+l+'</button>').join('')+'</div>'+
 '<div class="chip-row"><button class="chip '+(tf.show==='open'?'on':'')+'" onclick="tf.show=\'open\';render()">Активные</button><button class="chip '+(tf.show==='done'?'on':'')+'" onclick="tf.show=\'done\';tf.mode=\'\';render()">Выполненные</button><button class="chip '+(tf.mode==='prio'?'on':'')+'" onclick="tf.mode=tf.mode===\'prio\'?\'\':\'prio\';render()">По приоритету</button></div>'+
 '<div class="chip-row"><button class="chip '+(!tf.cat?'on':'')+'" onclick="tf.cat=\'\';render()">Все</button>'+CATS.map(c=>'<button class="chip '+(tf.cat===c?'on':'')+'" onclick="tf.cat=\''+c+'\';render()">'+e(c)+'</button>').join('')+'</div>'+
 (items.length?'<div class="task-list">'+(tf.mode==='prio'&&tf.show==='open'?[2,1,0].map(p=>'<section class="section"><h3>'+PR[p]+'</h3><div class="task-list">'+items.filter(t=>t.prio===p).map(t=>mydayTask(t)).join('')+'</div></section>').join(''):items.map(mydayTask).join(''))+'</div>':mydayEmpty(tf.show==='done'?'История пока пуста':'Список пока пуст',tf.show==='done'?'Выполненные задачи появятся здесь.':'Создай первую задачу. Срок и приоритет можно указать позже.'))+
 '<button class="btn task-add-wide" onclick="taskForm()">'+mydayIcon('plus',17)+' Добавить задачу</button></main>';
};
window.vStudy=function(){
 if(openSubj){
  const s=S.subjects.find(x=>x.id===openSubj);if(!s){openSubj=null;return window.vStudy()}
  const H=S.hw.filter(h=>h.subj===s.id),done=H.filter(h=>h.status===2).length,active=H.length-done,lateH=H.filter(h=>h.status!==2&&h.due&&h.due<today()).length;
  return '<main class="page">'+mydayHeader(e(s.name),s.closed?'Предмет закрыт · задания сохранены':'Домашние задания и сроки')+
  '<section class="study-hero"><div><div class="study-eyebrow">ПРЕДМЕТ</div><div class="subject-detail-title">'+e(s.name)+'</div><div class="study-hero-note">'+(s.closed?'Зачёт получен':active+' активных · '+lateH+' просрочено')+'</div></div><button class="btn" onclick="hwForm(\'\',\''+s.id+'\')">'+mydayIcon('plus',16)+' Задание</button></section>'+
  '<div class="study-stats"><div class="study-stat"><b>'+H.length+'</b><span>всего</span></div><div class="study-stat"><b>'+active+'</b><span>активных</span></div><div class="study-stat"><b>'+done+'</b><span>готово</span></div></div>'+
  mydaySection('Задания',H.length?Math.round(done/H.length*100)+'% выполнено':'Пока нет заданий')+
  '<div class="progress-track"><div class="progress-fill" style="width:'+(H.length?done/H.length*100:0)+'%"></div></div>'+
  (H.length?'<div class="task-list" style="margin-top:12px">'+H.slice().sort((a,b)=>(a.status===2)-(b.status===2)||(a.due||'9999').localeCompare(b.due||'9999')).map(h=>mydayTask({...h,k:'h',title:h.title})).join('')+'</div>':mydayEmpty('Заданий пока нет','Добавь лабораторную, курсовую или подготовку к зачёту.'))+
  '<button class="btn g" style="width:100%;margin-top:14px" onclick="subjEdit(\''+s.id+'\')">Настроить предмет</button><button class="btn g" style="width:100%;margin-top:8px" onclick="openSubj=null;render()">← Все предметы</button></main>';
 }
 const all=S.hw.slice(),active=all.filter(h=>h.status!==2),done=all.filter(h=>h.status===2),late=active.filter(h=>h.due&&h.due<today()),soon=active.filter(h=>h.due&&h.due>=today()&&h.due<=addDays(today(),7));
 const visible=studyFilter==='done'?done:studyFilter==='all'?all:studyFilter==='soon'?soon:active;
 return '<main class="page">'+mydayHeader('Учёба','Предметы, лабораторные и курсовые')+
 '<section class="study-hero"><div><div class="study-eyebrow">УЧЕБНАЯ НАГРУЗКА</div><div class="study-hero-title">'+active.length+' активных</div><div class="study-hero-note">'+(late.length?late.length+' просрочено':soon.length+' сроков на этой неделе')+'</div></div><button class="btn" onclick="subjEdit(\'\')">'+mydayIcon('plus',16)+' Предмет</button></section>'+
 '<div class="study-stats"><div class="study-stat"><b>'+S.subjects.length+'</b><span>предметов</span></div><div class="study-stat"><b>'+active.length+'</b><span>в работе</span></div><div class="study-stat"><b>'+done.length+'</b><span>выполнено</span></div></div>'+
 mydaySection('Мои предметы','Открой предмет, чтобы увидеть все задания')+
 '<div class="subject-grid">'+S.subjects.map((s,i)=>{const H=S.hw.filter(h=>h.subj===s.id),d=H.filter(h=>h.status===2).length,o=H.length-d,p=H.length?Math.round(d/H.length*100):0;return '<button class="subject-tile" onclick="openSubj=\''+s.id+'\';render()"><span class="subject-icon">'+mydayIcon('book',20)+'</span><b class="subject-name">'+e(s.name)+'</b><span class="subject-caption">'+(s.closed?'Зачёт получен':o+' активных заданий')+'</span><span class="progress-track"><span class="progress-fill" style="display:block;width:'+p+'%"></span></span></button>'}).join('')+'</div>'+
 '<section class="section">'+mydaySection('Задания по срокам','Ближайшие дела и история')+
 '<div class="chip-row">'+[['open','Активные',active.length],['soon','7 дней',soon.length],['done','Готово',done.length],['all','Все',all.length]].map(([k,l,n])=>'<button class="chip '+(studyFilter===k?'on':'')+'" onclick="studyFilter=\''+k+'\';render()">'+l+' · '+n+'</button>').join('')+'</div>'+
 (visible.length?'<div class="task-list">'+visible.slice().sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).map(h=>mydayTask({...h,k:'h',title:subj(h.subj)+': '+h.title})).join('')+'</div>':mydayEmpty('Нет заданий в этом списке','Здесь появятся задания по выбранному фильтру.'))+'</section></main>';
};

window.statsView=function(){
 const days=[...Array(7)].map((_,i)=>addDays(today(),i-6));
 const all=[...S.tasks,...S.hw],count=d=>all.filter(x=>x.doneAt===d).length;
 const max=Math.max(1,...days.map(count)),weekTotal=days.reduce((n,d)=>n+count(d),0);
 const monthTotal=all.filter(x=>x.doneAt&&x.doneAt.slice(0,7)===today().slice(0,7)).length;
 const overdue=allOpen().filter(x=>x.due&&x.due<today()).length;
 const focus=(S.focus||[]).filter(x=>x.d>=days[0]).reduce((n,x)=>n+(Number(x.m)||0),0);
 return '<main class="page">'+mydayHeader('Статистика','Спокойный обзор прогресса без лишней геймификации')+
 '<div class="metric-grid"><div class="metric-tile"><span class="metric-label">За 7 дней</span><b class="metric-value">'+weekTotal+'</b></div><div class="metric-tile"><span class="metric-label">За месяц</span><b class="metric-value">'+monthTotal+'</b></div><div class="metric-tile"><span class="metric-label">Просрочено</span><b class="metric-value '+(overdue?'danger':'')+'">'+overdue+'</b></div></div>'+
 '<section class="section surface-panel">'+mydaySection('Выполнено за неделю','Количество закрытых задач по дням')+
 '<div class="stats-bars">'+days.map((d,i)=>'<div class="stats-bar-col"><b>'+count(d)+'</b><span class="stats-bar-track"><i style="height:'+Math.max(4,count(d)/max*100)+'%"></i></span><small>'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][((new Date(d+'T12:00').getDay()+6)%7)]+'</small></div>').join('')+'</div></section>'+
 '<section class="section">'+mydaySection('Фокус','Время, отмеченное в таймере')+'<div class="surface-panel"><b class="metric-value">'+Math.floor(focus/60)+' ч '+(focus%60)+' мин</b><p class="page-sub">За последние семь дней</p></div></section>'+
 '<section class="section">'+mydaySection('Прогресс по предметам','Выполненные задания')+S.subjects.filter(s=>!s.closed).map(s=>{const H=S.hw.filter(h=>h.subj===s.id),d=H.filter(h=>h.status===2).length,p=H.length?Math.round(d/H.length*100):0;return '<div class="surface-panel" style="margin-bottom:9px"><div class="row"><b class="grow">'+e(s.name)+'</b><span class="tag">'+d+'/'+H.length+'</span></div><div class="progress-track"><div class="progress-fill" style="width:'+p+'%"></div></div></div>'}).join('')+'</section>'+
 '<button class="btn g" style="width:100%" onclick="st=null;render()">Готово</button></main>';
};
window.weekView=function(){
 const w=wk(),bucket=scheduleBucket('study',w),start=new Date(today()+'T12:00:00');start.setDate(start.getDate()-((start.getDay()+6)%7));
 const days=[1,2,3,4,5,6].map(d=>{const date=ds(new Date(start.getFullYear(),start.getMonth(),start.getDate()+d-1,12));return {d,date,lessons:(bucket[d]||[]).slice().sort((a,b)=>a.s.localeCompare(b.s)),tasks:allOpen().filter(x=>x.due===date)}});
 const total=days.reduce((n,x)=>n+x.lessons.length,0);
 return '<main class="page">'+mydayHeader('План недели','Учебная неделя · '+wkName(w))+
 '<div class="metric-grid"><div class="metric-tile"><span class="metric-label">Занятия</span><b class="metric-value">'+total+'</b></div><div class="metric-tile"><span class="metric-label">Дедлайны</span><b class="metric-value">'+days.reduce((n,x)=>n+x.tasks.length,0)+'</b></div><div class="metric-tile"><span class="metric-label">Дней</span><b class="metric-value">'+days.filter(x=>x.lessons.length||x.tasks.length).length+'</b></div></div>'+
 '<div class="week-list">'+days.map(x=>'<button class="week-day-card" onclick="schedSpace=\'study\';sd='+x.d+';st=\''+w+'\';tab=\'sched\';render()"><span class="week-day-date"><b>'+['','Пн','Вт','Ср','Чт','Пт','Сб'][x.d]+'</b><small>'+fmt(x.date)+'</small></span><span class="week-day-summary"><b>'+x.lessons.length+' '+ruCount(x.lessons.length,'пара','пары','пар')+'</b><small>'+x.tasks.length+' задач · '+(x.lessons[0]?x.lessons[0].s+' первая':'свободно')+'</small></span><span class="week-day-arrow">›</span></button>').join('')+'</div></main>';
};
window.mydayChangeMonth=function(delta){
 const d=new Date((cdsel||today())+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+delta);cdsel=ds(d);render();
};
window.calView=function(){
 const selected=cdsel||today(),current=new Date(selected+'T12:00:00'),year=current.getFullYear(),month=current.getMonth();
 const first=new Date(year,month,1,12),offset=(first.getDay()+6)%7,daysInMonth=new Date(year,month+1,0).getDate();
 const events=S.events||[],all=allOpen(),cells=[];
 for(let i=0;i<42;i++){
  const num=i-offset+1,d=new Date(year,month,num,12),key=ds(d),inside=d.getMonth()===month;
  const eventCount=events.filter(x=>x.date===key).length,taskCount=all.filter(x=>x.due===key).length;
  cells.push('<button class="cal-day '+(inside?'':'outside')+' '+(key===selected?'selected':'')+' '+(key===today()?'is-today':'')+'" aria-label="'+fmt(key)+', '+eventCount+' событий, '+taskCount+' задач" onclick="cdsel=\''+key+'\';render()"><b>'+d.getDate()+'</b>'+(eventCount+taskCount?'<i></i>':'')+'</button>');
 }
 const chosenEvents=events.map((z,i)=>({z,i})).filter(x=>x.z.date===selected);
 const chosenTasks=all.filter(x=>x.due===selected);
 return '<main class="page">'+mydayHeader('Календарь','Дедлайны, экзамены и важные события')+
 '<section class="surface-panel"><div class="calendar-heading"><button class="icon-btn" aria-label="Предыдущий месяц" onclick="mydayChangeMonth(-1)">'+mydayIcon('chevron',17)+'</button><h2>'+current.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})+'</h2><button class="icon-btn" aria-label="Следующий месяц" onclick="mydayChangeMonth(1)">'+mydayIcon('chevron',17)+'</button></div><div class="calendar-grid calendar-weekdays">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="calendar-grid">'+cells.join('')+'</div><button class="text-link" style="margin-top:8px" onclick="cdsel=today();render()">Перейти к сегодня</button></section>'+
 '<section class="section">'+mydaySection(fmt(selected),'События и задачи на выбранный день','<button class="text-link" onclick="evForm()">+ Событие</button>')+
 (chosenEvents.length?'<div class="task-list">'+chosenEvents.map(({z,i})=>'<div class="task-item"><span class="subject-icon">'+mydayIcon('calendar',18)+'</span><span class="task-main"><b class="task-title">'+e(z.title)+'</b><small class="task-meta">'+e(z.type||'Событие')+'</small></span><button class="icon-btn" aria-label="Удалить событие" onclick="evDel('+i+')">'+mydayIcon('close',16)+'</button></div>').join('')+'</div>':mydayEmpty('Событий нет','Добавь экзамен, зачёт или важную дату.'))+
 (chosenTasks.length?'<div class="task-list" style="margin-top:10px">'+chosenTasks.map(mydayTask).join('')+'</div>':'')+'</section></main>';
};
window.vMore=function(){
 if(st==='inbox')return '<main class="page">'+mydayHeader('Идеи и заметки','Сохраняй мысли, не превращая их сразу в задачи',false)+mydaySection('Входящие',S.inbox.length?S.inbox.length+' заметок ждут разбора':'Пока пусто','<button class="btn" onclick="capture()">'+mydayIcon('plus',16)+' Записать</button>')+(S.inbox.length?'<div class="task-list">'+S.inbox.map((n,i)=>'<div class="task-item"><span class="settings-icon">'+mydayIcon('inbox',17)+'</span><button class="task-main" style="border:0;background:transparent;text-align:left;padding:0" onclick="toTask('+i+')"><span class="task-title">'+e(n.text)+'</span><span class="task-meta">'+e(n.d||'Без даты')+' · Нажми, чтобы превратить в задачу</span></button><button class="icon-btn" style="width:34px;height:34px" aria-label="Удалить заметку" onclick="S.inbox.splice('+i+',1);save();render()">'+mydayIcon('close',15)+'</button></div>').join('')+'</div>':mydayEmpty('Входящие пусты','Быстро запиши мысль через кнопку «Записать».'))+'<button class="btn g" style="width:100%;margin-top:14px" onclick="st=null;render()">← Настройки</button></main>';
 if(st==='uni'){const u=S.uni;return '<main class="page">'+mydayHeader('Университет','Ссылки, контакты и полезная информация')+'<section class="surface-panel"><label for="u1">Название университета</label><input id="u1" value="'+e(u.name)+'"><label for="u2">Личный кабинет · ссылка</label><input id="u2" value="'+e(u.url)+'" inputmode="url"><label for="u3">Логин</label><input id="u3" value="'+e(u.login)+'"><p class="page-sub">Пароль здесь не хранится. Используй менеджер паролей iPhone.</p><label for="u4">Полезные ссылки</label><textarea id="u4">'+e(u.links)+'</textarea><label for="u5">Контакты преподавателей</label><textarea id="u5">'+e(u.teachers)+'</textarea><label for="u6">Заметки</label><textarea id="u6">'+e(u.notes)+'</textarea><button class="btn" style="width:100%" onclick="saveUni()">Сохранить</button><button class="btn g" style="width:100%;margin-top:8px" onclick="saveUni();openUni()">Открыть сайт университета</button><button class="btn g" style="width:100%;margin-top:8px" onclick="st=null;render()">Назад</button></section></main>'}
 if(st==='inbox')return '<main class="page">'+mydayHeader('Идеи и заметки','Сохраняй мысли, не превращая их в обязательства')+(S.inbox.length?'<div class="task-list">'+S.inbox.map((n,i)=>'<div class="task-item"><span class="subject-icon">'+mydayIcon('inbox',18)+'</span><span class="task-main"><b class="task-title">'+e(n.text)+'</b><small class="task-meta">'+e(n.d||'')+'</small></span><button class="btn g" onclick="toTask('+i+')">В задачу</button><button class="icon-btn" aria-label="Удалить заметку" onclick="S.inbox.splice('+i+',1);save();render()">'+mydayIcon('close',16)+'</button></div>').join('')+'</div>':mydayEmpty('Пока пусто','Добавь мысль через кнопку быстрой записи.'))+'<button class="btn g" style="width:100%;margin-top:12px" onclick="st=null;render()">Назад</button></main>';
 if(st==='stats')return statsView();
 if(st==='cal')return calView();
 if(st==='week')return weekView();
 const M=S.settings;
 const tools=[
  ['uni','Университет','Ссылки, контакты, заметки'],
  ['week','План недели','Нагрузка по дням'],
  ['cal','Календарь','Дедлайны и события'],
  ['stats','Статистика','Фокус и прогресс'],
  ['inbox','Идеи и заметки','Быстрые записи без срока']
 ];
 return '<main class="page">'+mydayHeader('Настройки','Всё для комфортной работы MYDAY',false)+
 '<section class="section">'+mydaySection('Инструменты','Дополнительные разделы')+
 '<div class="settings-list">'+tools.map(([id,title,desc])=>'<button class="settings-card" onclick="'+(id==='uni'?'st=\'uni\';render()':id==='inbox'?'st=\'inbox\';render()':'st=\''+id+'\';render()')+'"><span class="settings-icon">'+mydayIcon(id==='uni'?'uni':id==='week'||id==='cal'?'calendar':id==='stats'?'stats':'inbox')+'</span><span class="settings-copy"><b>'+title+'</b><small>'+desc+'</small></span><span class="settings-arrow">›</span></button>').join('')+'</div></section>'+
 '<section class="section">'+mydaySection('Внешний вид','Выбери комфортный режим')+
 '<div class="surface-panel"><div class="theme-options"><button class="'+(M.theme==='light'?'on':'')+'" onclick="setTheme(\'light\')"><span class="theme-option-icon">☀</span><b>Светлая</b></button><button class="'+(M.theme==='dark'?'on':'')+'" onclick="setTheme(\'dark\')"><span class="theme-option-icon">☾</span><b>Тёмная</b></button><button class="'+(M.theme==='auto'?'on':'')+'" onclick="setTheme(\'auto\')"><span class="theme-option-icon">◐</span><b>Система</b></button></div><label for="ui-accent">Акцентный цвет</label><select id="ui-accent" onchange="S.settings.accent=+this.value;save();render()"><option value="0" '+((M.accent||0)===0?'selected':'')+'>Синий Apple</option><option value="1" '+(M.accent===1?'selected':'')+'>Фиолетовый</option><option value="2" '+(M.accent===2?'selected':'')+'>Зелёный</option><option value="3" '+(M.accent===3?'selected':'')+'>Оранжевый</option><option value="4" '+(M.accent===4?'selected':'')+'>Розовый</option></select></div></section>'+
 '<section class="section">'+mydaySection('Напоминания','Настрой, когда MYDAY напомнит о делах')+
 '<div class="surface-panel"><label for="ui-morning">Утреннее напоминание</label><input id="ui-morning" type="time" value="'+e(M.morning||'08:00')+'" onchange="S.settings.morning=this.value;save()"><label for="ui-delay">Напоминание о домашних заданиях, минут после последней пары</label><input id="ui-delay" type="number" min="0" max="240" step="5" value="'+(Number(M.hwDelay)||60)+'" onchange="S.settings.hwDelay=Math.max(0,Math.min(240,+this.value||0));save()"><label style="display:flex;align-items:center;margin:10px 0"><input type="checkbox" '+(M.notif===false?'':'checked')+' onchange="S.settings.notif=this.checked;save()"> Напоминания MYDAY включены</label><button class="btn g" style="width:100%;margin-top:8px" onclick="askNotif()">Разрешить уведомления</button></div></section>'+
 '<section class="section">'+mydaySection('Синхронизация','Личные данные и резервные копии')+
 '<div class="surface-panel"><b>Облачная синхронизация</b><p class="page-sub" role="status" aria-live="polite" data-cloud-status>'+e(cloudStatus)+'</p><p class="page-sub">'+(tgUserId?'Telegram-профиль определён':'Открой MYDAY через Telegram, чтобы использовать личный профиль')+'</p><button class="btn g" style="width:100%;margin-top:12px" onclick="retryCloud()">Проверить соединение</button>'+(cloudConflict?'<div class="row" style="margin-top:10px"><button class="btn g grow" onclick="acceptCloudRemote()">Загрузить облачную</button><button class="btn grow" onclick="keepLocalVersion()">Оставить мою</button></div><p class="page-sub">Локальная копия сохранена отдельно.</p>':'')+(cloudConflictBackupAvailable?'<button class="btn g" style="width:100%;margin-top:8px" onclick="downloadCloudConflict()">Скачать локальную копию</button>':'')+'<div class="row" style="margin-top:9px"><button class="btn g grow" onclick="exp()">Экспорт</button><button class="btn g grow" onclick="imp()">Импорт</button></div></div></section>'+
 '<section class="section">'+mydaySection('Данные приложения','Управление локальными данными')+
 '<div class="settings-list"><button class="settings-card" onclick="exp()"><span class="settings-icon">'+mydayIcon('inbox')+'</span><span class="settings-copy"><b>Скачать резервную копию</b><small>Сохранить задачи, расписание и настройки</small></span><span class="settings-arrow">›</span></button><button class="settings-card" onclick="imp()"><span class="settings-icon">'+mydayIcon('calendar')+'</span><span class="settings-copy"><b>Восстановить данные</b><small>Загрузить резервную копию JSON</small></span><span class="settings-arrow">›</span></button></div></section></main>';
};
window.render=function(){
 const th=resolvedTheme(),root=document.documentElement;root.dataset.theme=th;
 const palette=[['#087cff','#0067df'],['#8b6cff','#6c4ee6'],['#24a36b','#168452'],['#ed8a35','#cc6b1c'],['#e45d91','#c83d72']];
 const accent=palette[Math.max(0,Math.min(4,Number(S.settings.accent)||0))];
 root.style.setProperty('--accent',accent[0]);root.style.setProperty('--accent-2',accent[1]);root.style.setProperty('--accent-soft','color-mix(in srgb,'+accent[0]+' 12%,var(--surface))');
 const pageColor=th==='light'?'#f4f5f8':'#101217',meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=pageColor;
 try{tgApp&&tgApp.setHeaderColor&&tgApp.setHeaderColor(pageColor);tgApp&&tgApp.setBackgroundColor&&tgApp.setBackgroundColor(pageColor);tgApp&&tgApp.setBottomBarColor&&tgApp.setBottomBarColor(pageColor)}catch(_){}
 const tabs=[['today','today','День'],['sched','sched','План'],['tasks','tasks','Задачи'],['study','study','Учёба'],['more','more','Ещё']];
 document.querySelector('#nav').innerHTML=tabs.map(([key,icon,label])=>'<button class="'+(tab===key?'on':'')+'" aria-current="'+(tab===key?'page':'false')+'" aria-label="'+label+'" onclick="go(\''+key+'\')"><b>'+mydayIcon(icon,22)+'</b><span>'+label+'</span></button>').join('');
 document.querySelector('#app').innerHTML=({today:window.vToday,sched:window.vSched,tasks:window.vTasks,study:window.vStudy,more:window.vMore})[tab]();
 if(typeof enhanceActionSemantics==='function')enhanceActionSemantics();
};
window.sheet=function(h){
 const old=document.querySelector('#ov'),replacing=!!old;
 if(old)old.remove();else{window._dialogTrigger=document.activeElement!==document.body?document.activeElement:null;window._dialogOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
 const o=document.createElement('div');o.className='ov'+(replacing?' nos':'');o.id='ov';o.addEventListener('click',ev=>{if(ev.target===o)close_()});
 o.innerHTML='<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="grab" aria-hidden="true"></div><button class="sheet-close" type="button" aria-label="Закрыть" onclick="close_()">'+mydayIcon('close',17)+'</button>'+h+'</div>';
 document.body.appendChild(o);
 const panel=o.querySelector('.sheet'),title=panel.querySelector('h1');
 if(title){title.id=title.id||'dialog-title';panel.setAttribute('aria-labelledby',title.id);title.tabIndex=-1}else panel.setAttribute('aria-label','Диалог');
 panel.querySelectorAll('label').forEach(l=>{if(l.htmlFor||l.querySelector('input,select,textarea'))return;const f=l.nextElementSibling;if(f&&f.matches('input,select,textarea')){if(!f.id)f.id='field-'+id();l.htmlFor=f.id}});
 panel.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ev.preventDefault();close_();return}if(ev.key!=='Tab')return;const a=[...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);if(!a.length){ev.preventDefault();panel.focus();return}if(ev.shiftKey&&document.activeElement===a[0]){ev.preventDefault();a[a.length-1].focus()}else if(!ev.shiftKey&&document.activeElement===a[a.length-1]){ev.preventDefault();a[0].focus()}});
 setTimeout(()=>{if(o.isConnected)(title||panel).focus({preventScroll:true})},20);
};
window.close_=function(){
 const o=document.querySelector('#ov');if(!o)return;o.classList.add('bye');setTimeout(()=>{o.remove();document.body.style.overflow=window._dialogOverflow||'';const t=window._dialogTrigger;window._dialogTrigger=null;if(t&&t.isConnected)t.focus({preventScroll:true})},190);
};

MYDAY_ICONS.mic='<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/>';
window.capture=function(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 const voiceButton=SR?'<button class="btn g" onclick="voice()">'+mydayIcon('mic',16)+' Голос</button>':'';
 sheet('<h1>Быстрая запись</h1><p class="page-sub">Сохрани мысль сейчас, а разберёшь её позже.</p><textarea id="cq" oninput="capHint()" placeholder="Задача, идея или заметка…"></textarea><div id="chint" style="min-height:24px;margin-bottom:8px"></div><div id="tpl" style="margin-bottom:10px">'+tplHtml()+'</div><label for="cd">Срок · необязательно</label><input type="date" id="cd">'+dch('cd')+'<label for="ck">Сохранить как</label><select id="ck"><option value="t">Задача</option><option value="i">Идея / заметка</option></select><div class="row">'+voiceButton+'<button class="btn grow" onclick="capSave()">'+mydayIcon('check',16)+' Сохранить</button></div><label style="display:flex;align-items:center;margin-top:12px"><input type="checkbox" id="cs" onchange="capHint()"> Разбить на отдельные задачи</label>');
};
window.MYDAY_APPLE_UI_PENDING=false;
window.render();
