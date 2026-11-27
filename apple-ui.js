/* MYDAY 2.0 interaction layer.
   Replaces every screen. Domain actions, storage and cloud sync stay in index.html. */
const MYDAY_ICONS = {
  today: '<path d="M4 8.5h16M8 4v3m8-3v3"/><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 12h3m0 0v4"/>',
  sched: '<path d="M4 7h16M8 4v3m8-3v3"/><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 12h8M8 16h5"/>',
  tasks: '<path d="M9 7h11M9 12h11M9 17h8"/><path d="m4 7 1.2 1.2L7.5 6M4 12l1.2 1.2L7.5 11M4 17l1.2 1.2L7.5 16"/>',
  study: '<path d="M3.5 6.5c3.2-1.2 6.2-.8 8.5 1.2 2.3-2 5.3-2.4 8.5-1.2V19c-3.2-1.2-6.2-.8-8.5 1.2C9.7 18.2 6.7 17.8 3.5 19z"/><path d="M12 7.7V20"/>',
  more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4.2 4.2L19 7"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l2.5 1.5"/>',
  book: '<path d="M3.5 6.5c3.2-1.2 6.2-.8 8.5 1.2 2.3-2 5.3-2.4 8.5-1.2V19c-3.2-1.2-6.2-.8-8.5 1.2C9.7 18.2 6.7 17.8 3.5 19z"/>',
  calendar: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 4v3m8-3v3M4 10h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"/>',
  uni: '<path d="m3 9 9-5 9 5"/><path d="M5 10.5V19m4.5-8.5V19M14.5 10.5V19M19 10.5V19M3 19h18"/>',
  stats: '<path d="M5 19V10m5 9V6m5 13v-7m4 7V4"/>',
  inbox: '<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  sun: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2M12 18.5v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M3.5 12h2M18.5 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4"/>',
  moon: '<path d="M16.5 14.2A6.6 6.6 0 0 1 9.2 4.6 7 7 0 1 0 16.5 14.2z"/>',
  system: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M9 20h6m-3-4v4"/>',
  mic: '<rect x="9" y="4" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3"/>'
};

function mydayIcon(name, size) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (MYDAY_ICONS[name] || MYDAY_ICONS.more) + '</svg>';
}

function mydayHeader(title, subtitle, actions, plain) {
  const tools = actions === false ? '' : '<div class="page-actions"><button class="icon-btn" type="button" aria-label="Поиск" onclick="search()">' + mydayIcon('search') + '</button><button class="icon-btn" type="button" aria-label="Быстрая запись" onclick="capture()">' + mydayIcon('plus') + '</button></div>';
  return '<header class="page-top"><div class="page-top-copy"><h1 class="page-title' + (plain ? ' plain' : '') + '">' + title + '</h1>' + (subtitle ? '<p class="page-sub">' + subtitle + '</p>' : '') + '</div>' + tools + '</header>';
}

function mydaySection(title, caption, action) {
  return '<div class="section-head"><div><h2>' + title + '</h2>' + (caption ? '<p class="section-caption">' + caption + '</p>' : '') + '</div>' + (action || '') + '</div>';
}

function mydayTask(x) {
  const k = x.k || 't';
  const done = x.status == 2;
  const overdue = !!(x.due && x.due < today() && !done);
  const bits = [];
  if (x.due) bits.push(fmt(x.due));
  if (x.cat) bits.push(x.cat);
  if (x.prio == 2) bits.push('высокий');
  if (x.subs && x.subs.length) bits.push(x.subs.filter(s => s.d).length + '/' + x.subs.length);
  return '<div class="task-item"><button class="task-check ' + (done ? 'on' : '') + '" type="button" aria-label="' + (done ? 'Вернуть в активные' : 'Отметить выполненным') + ': ' + e(x.title) + '" aria-pressed="' + done + '" onclick="tog(\'' + k + '\',\'' + x.id + '\')">' + mydayIcon('check', 14) + '</button><button class="task-main" type="button" onclick="detail(\'' + k + '\',\'' + x.id + '\')"><span class="task-title ' + (done ? 'done' : '') + '">' + e(x.title) + '</span><span class="task-meta"><span class="' + (overdue ? 'late' : '') + '">' + e(bits.join(' · ')) + '</span></span></button><span class="task-chevron" aria-hidden="true">' + mydayIcon('chevron', 16) + '</span></div>';
}

function mydayEmpty(title, caption) {
  return '<div class="empty-state"><b>' + title + '</b><span>' + caption + '</span></div>';
}

function mydayLessons(list, current, onClick) {
  if (!list.length) return '';
  return '<div class="timeline-list">' + list.map(l => {
    const action = onClick(l);
    return '<button class="timeline-item ' + (current && current.id == l.id ? 'current' : '') + '" type="button" onclick="' + action + '"><span class="timeline-time">' + l.s.slice(0, 5) + '</span><span class="timeline-rail"><i class="timeline-dot"></i></span><span class="timeline-content"><b class="timeline-title">' + e(l.subj) + '</b><span class="timeline-meta"><span>' + l.s + '–' + l.e + '</span>' + (l.teacher ? '<span>' + e(l.teacher) + '</span>' : '') + '</span><span class="timeline-room">' + e(roomOf(l) || '') + '</span></span></button>';
  }).join('') + '</div>';
}

function ring(pct, label, center) {
  const c = 2 * Math.PI * 22;
  const off = c * (1 - Math.max(0, Math.min(100, pct || 0)) / 100);
  return '<svg class="progress-ring" viewBox="0 0 56 56" role="img" aria-label="' + e(label) + '"><circle cx="28" cy="28" r="22" fill="none" stroke="var(--surface-3)" stroke-width="4"/><circle cx="28" cy="28" r="22" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" transform="rotate(-90 28 28)" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/><text x="28" y="32" text-anchor="middle" fill="var(--ink)" font-size="12" font-family="Manrope,sans-serif" font-weight="700">' + e(center || '—') + '</text></svg>';
}

window.vToday = function () {
  const n = new Date();
  const t = today();
  const L = lessons(n);
  const all = allOpen();
  const hm = pad(n.getHours()) + ':' + pad(n.getMinutes());
  const current = L.find(l => l.s <= hm && l.e > hm);
  const overdue = all.filter(x => x.due && x.due < t);
  const due = all.filter(x => x.due == t);
  const work = due.filter(x => (x.space || 'personal') === 'work');
  const todayTasks = due.filter(x => (x.space || 'personal') !== 'work');
  const done = S.done.filter(x => x === t).length;
  const total = todayTasks.length + done;
  const pct = total ? Math.round(done / total * 100) : 0;
  const hour = n.getHours();
  const greeting = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const parts = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).formatToParts(n);
  const dayNum = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  const weekday = n.toLocaleDateString('ru-RU', { weekday: 'long' });
  const soon = all.filter(x => x.due && x.due > t && x.due <= addDays(t, 3)).slice(0, 4);
  const next = L.find(l => l.s > hm);
  const heroTitle = current ? e(current.subj) : (next ? 'Дальше · ' + e(next.subj) : (L.length ? 'Занятия уже позади' : 'Свободный день'));
  const heroNote = current ? 'Сейчас идёт до ' + current.e + (roomOf(current) ? ' · ' + e(roomOf(current)) : '') : (total ? 'Закрыто ' + done + ' из ' + total + ' дел на сегодня' : 'Ничего срочного. Можно добавить одно дело и закрыть день.');
  return '<main class="page">' +
    '<header class="page-top"><div class="page-top-copy"><p class="eyebrow">' + e(weekday) + ' · ' + e(wkName(wk())) + '</p><h1 class="page-title">' + dayNum + '<br>' + e(month) + '</h1><p class="page-sub">' + greeting + (tgApp && tgApp.initDataUnsafe && tgApp.initDataUnsafe.user && tgApp.initDataUnsafe.user.first_name ? ', ' + e(tgApp.initDataUnsafe.user.first_name) : '') + '.</p></div><div class="page-actions"><button class="icon-btn" type="button" aria-label="Поиск" onclick="search()">' + mydayIcon('search') + '</button><button class="icon-btn" type="button" aria-label="Быстрая запись" onclick="capture()">' + mydayIcon('plus') + '</button></div></header>' +
    '<section class="hero-card"><div class="hero-copy"><div class="hero-kicker">' + (current ? 'Сейчас' : 'Сегодня') + '</div><div class="hero-title">' + heroTitle + '</div><p class="hero-note">' + heroNote + '</p></div>' + ring(total ? pct : 0, total ? pct + '% задач выполнено' : 'Нет задач на сегодня', total ? (done + '/' + total) : '—') + '</section>' +
    '<div class="metric-grid"><div class="metric-tile"><span class="metric-label">Пары</span><b class="metric-value">' + L.length + '</b></div><div class="metric-tile"><span class="metric-label">Дела</span><b class="metric-value">' + todayTasks.length + '</b></div><div class="metric-tile"><span class="metric-label">Долги</span><b class="metric-value ' + (overdue.length ? 'danger' : '') + '">' + overdue.length + '</b></div></div>' +
    '<div class="today-grid"><section>' + mydaySection('Расписание', L.length ? ruCount(L.length, 'запись', 'записи', 'записей') : 'День без пар', '<button class="text-link" type="button" onclick="go(\'sched\')">Неделя</button>') +
    (L.length ? mydayLessons(L, current, l => 'lessonDay(\'' + l.id + '\',\'' + t + '\')') : mydayEmpty('Пар нет', 'Расписание этого дня пустое. Это тоже план.')) +
    excRows(t) + '</section><aside class="today-right"><section>' +
    mydaySection('На сегодня', todayTasks.length ? 'Что стоит закрыть' : 'Список чист', '<button class="text-link" type="button" onclick="go(\'tasks\')">Все</button>') +
    '<div class="quick-add"><input id="qa" aria-label="Быстро добавить задачу" placeholder="Добавить задачу…" onkeydown="if(event.key===\'Enter\')qadd()"><button type="button" aria-label="Добавить задачу" onclick="qadd()">' + mydayIcon('plus', 18) + '</button></div>' +
    (todayTasks.length ? '<div class="task-list">' + todayTasks.map(mydayTask).join('') + '</div>' : mydayEmpty('Пока пусто', 'Одно дело — и день уже не держится в голове.')) + '</section>' +
    (work.length ? '<section class="section">' + mydaySection('Работа') + '<div class="task-list">' + work.map(mydayTask).join('') + '</div></section>' : '') +
    (overdue.length ? '<section class="section">' + mydaySection('Нужно внимание', ruCount(overdue.length, 'просроченное дело', 'просроченных дела', 'просроченных дел')) + '<div class="task-list">' + overdue.slice(0, 5).map(mydayTask).join('') + '</div></section>' : '') +
    (soon.length ? '<section class="section">' + mydaySection('Ближайшие три дня') + '<div class="task-list">' + soon.map(mydayTask).join('') + '</div></section>' : '') +
    tm() + '</aside></div></main>';
};

window.vSched = function () {
  const space = schedSpace === 'work' ? 'work' : 'study';
  const week = space === 'work' ? 'work' : (st === 'odd' || st === 'even' ? st : wk());
  const bucket = scheduleBucket(space, week);
  const days = [1, 2, 3, 4, 5, 6];
  const list = (bucket[sd] || []).slice().sort((a, b) => a.s.localeCompare(b.s));
  const todayDay = new Date().getDay();
  const counts = days.map(d => (bucket[d] || []).length);
  const dayHtml = days.map(d => '<button class="day-pill ' + (sd === d ? 'on ' : '') + (todayDay === d ? 'today' : '') + '" type="button" aria-pressed="' + (sd === d) + '" onclick="sd=' + d + ';render()"><strong>' + ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d] + '</strong><small>' + (counts[d - 1] || '–') + '</small></button>').join('');
  return '<main class="page">' + mydayHeader('Расписание', space === 'study' ? 'Учёба · ' + wkName(week) : 'Рабочий график, каждую неделю', true, true) +
    '<div class="segmented"><button class="seg-btn ' + (space === 'study' ? 'on' : '') + '" type="button" onclick="schedSpace=\'study\';st=null;render()">Учёба</button><button class="seg-btn ' + (space === 'work' ? 'on' : '') + '" type="button" onclick="schedSpace=\'work\';st=\'work\';render()">Работа</button></div>' +
    '<section class="schedule-control"><div class="schedule-week-label"><span>' + (space === 'study' ? 'Тип недели' : 'Повтор') + '</span><b class="week-cycle">' + (space === 'study' ? wkName(week) : 'Каждую неделю') + '</b></div>' +
    (space === 'study' ? '<div class="chip-row"><button class="chip ' + (week === 'odd' ? 'on' : '') + '" type="button" onclick="st=\'odd\';render()">Нижняя</button><button class="chip ' + (week === 'even' ? 'on' : '') + '" type="button" onclick="st=\'even\';render()">Верхняя</button><button class="chip" type="button" onclick="go(\'more\');st=\'cal\';render()">Календарь</button></div>' : '') +
    '<div class="day-strip">' + dayHtml + '</div></section>' +
    '<div class="schedule-day-head"><div><div class="eyebrow">' + DAYS[sd].toUpperCase() + '</div><h2>' + DAYS[sd] + '</h2><p>' + (list.length ? ruCount(list.length, 'запись', 'записи', 'записей') : 'Свободно') + '</p></div><button class="btn" type="button" onclick="lessonForm(\'' + week + '\')">' + mydayIcon('plus', 16) + ' Добавить</button></div>' +
    (list.length ? '<section class="schedule-wrap">' + mydayLessons(list, null, l => 'lessonForm(\'' + week + '\',\'' + l.id + '\')') + '</section>' : mydayEmpty('День свободен', 'Добавь пару, смену или встречу. Она останется только в этом пространстве.')) +
    '<div class="schedule-actions"><button class="btn g" type="button" onclick="bulkForm(\'' + week + '\')">Списком</button>' + (space === 'study' ? '<button class="btn g" type="button" onclick="copyForm(\'' + week + '\')">Копировать день</button>' : '') + '</div></main>';
};

window.vTasks = function () {
  const all = S.tasks.filter(t => (t.space || 'personal') === taskSpace);
  let items = all.filter(t => (tf.show === 'done' ? t.status == 2 : t.status != 2) && (!tf.cat || t.cat === tf.cat));
  items.sort((a, b) => tf.show === 'done' ? (b.doneAt || '').localeCompare(a.doneAt || '') : (a.due || '9999').localeCompare(b.due || '9999') || b.prio - a.prio);
  const name = taskSpace === 'study' ? 'Учёба' : taskSpace === 'work' ? 'Работа' : 'Личное';
  const active = all.filter(t => t.status != 2).length;
  const done = all.length - active;
  const spaces = [['study', 'Учёба'], ['work', 'Работа'], ['personal', 'Личное']];
  const groups = tf.show === 'done' ? [['done', 'Выполненные', items]] : [
    ['late', 'Просрочено', items.filter(t => t.due && t.due < today())],
    ['today', 'Сегодня', items.filter(t => t.due === today())],
    ['tomorrow', 'Завтра', items.filter(t => t.due === addDays(today(), 1))],
    ['week', 'На неделе', items.filter(t => t.due && t.due > addDays(today(), 1) && t.due <= addDays(today(), 7))],
    ['later', 'Позже', items.filter(t => t.due && t.due > addDays(today(), 7))],
    ['none', 'Без срока', items.filter(t => !t.due)]
  ].filter(g => g[2].length);
  const body = !items.length ? mydayEmpty(tf.show === 'done' ? 'История пуста' : 'Список пуст', tf.show === 'done' ? 'Отмеченные дела появятся здесь.' : 'Название, срок и приоритет можно уточнить сразу или потом.') :
    (tf.mode === 'prio' && tf.show === 'open' ? [2, 1, 0].map(p => '<section class="zone" data-p="' + p + '"><h3>' + PR[p] + '</h3>' + (items.filter(t => t.prio === p).map(t => '<div class="dr"><div class="hd" aria-hidden="true" onpointerdown="dragStart(event,\'' + t.id + '\')">⋮</div>' + mydayTask(t) + '</div>').join('') || '<div class="sub">Пусто</div>') + '</section>').join('') :
      '<div class="task-list">' + groups.map(g => '<section class="task-group"><h3>' + g[1] + '</h3>' + g[2].map(mydayTask).join('') + '</section>').join('') + '</div>');
  return '<main class="page">' + mydayHeader('Задачи', name + ' · ' + (tf.show === 'done' ? 'история' : 'что ещё открыто'), true, true) +
    '<section class="task-overview"><div><div class="eyebrow">' + name.toUpperCase() + '</div><div class="task-overview-number">' + (tf.show === 'done' ? done : active) + '</div><div class="task-overview-caption">' + (tf.show === 'done' ? 'в истории' : 'ещё открыто') + '</div></div><div class="task-overview-side"><span>Готово</span><b>' + done + '</b><span>Всего</span><b>' + all.length + '</b></div><button class="btn" type="button" onclick="taskForm()">' + mydayIcon('plus', 16) + ' Новая задача</button></section>' +
    '<div class="segmented">' + spaces.map(([v, l]) => '<button class="seg-btn ' + (taskSpace === v ? 'on' : '') + '" type="button" onclick="taskSpace=\'' + v + '\';tf.cat=\'\';render()">' + l + '</button>').join('') + '</div>' +
    '<div class="chip-row"><button class="chip ' + (tf.show === 'open' ? 'on' : '') + '" type="button" onclick="tf.show=\'open\';render()">Активные</button><button class="chip ' + (tf.show === 'done' ? 'on' : '') + '" type="button" onclick="tf.show=\'done\';tf.mode=\'\';render()">Выполненные</button><button class="chip ' + (tf.mode === 'prio' ? 'on' : '') + '" type="button" onclick="tf.mode=tf.mode===\'prio\'?\'\':\'prio\';tf.show=\'open\';render()">Приоритет</button></div>' +
    '<label for="task-cat">Категория</label><select id="task-cat" aria-label="Категория" onchange="tf.cat=this.value;render()"><option value="" ' + (!tf.cat ? 'selected' : '') + '>Все категории</option>' + CATS.map(c => '<option value="' + e(c) + '" ' + (tf.cat === c ? 'selected' : '') + '>' + e(c) + '</option>').join('') + '</select>' +
    body + '</main>';
};

window.vStudy = function () {
  if (openSubj) {
    const s = S.subjects.find(x => x.id === openSubj);
    if (!s) { openSubj = null; return window.vStudy(); }
    const H = S.hw.filter(h => h.subj === s.id);
    const done = H.filter(h => h.status === 2).length;
    const active = H.length - done;
    const lateH = H.filter(h => h.status !== 2 && h.due && h.due < today()).length;
    const pct = H.length ? Math.round(done / H.length * 100) : 0;
    return '<main class="page">' + mydayHeader(e(s.name), s.closed ? 'Зачёт есть · задания сохранены' : (active + ' в работе' + (lateH ? ' · ' + lateH + ' просрочено' : '')), true, true) +
      '<div class="study-stats"><div class="study-stat"><b>' + H.length + '</b><span>всего</span></div><div class="study-stat"><b>' + active + '</b><span>открыто</span></div><div class="study-stat"><b>' + done + '</b><span>готово</span></div></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      mydaySection('Задания', pct + '% закрыто', '<button class="text-link" type="button" onclick="hwForm(\'\',\'' + s.id + '\')">Добавить</button>') +
      (H.length ? '<div class="task-list">' + H.slice().sort((a, b) => (a.status === 2) - (b.status === 2) || (a.due || '9999').localeCompare(b.due || '9999')).map(h => mydayTask({ ...h, k: 'h' })).join('') + '</div>' : mydayEmpty('Заданий нет', 'Лабораторная, курсовая или подготовка к зачёту.')) +
      '<div class="schedule-actions"><button class="btn g" type="button" onclick="subjEdit(\'' + s.id + '\')">Настроить предмет</button><button class="btn g" type="button" onclick="openSubj=null;render()">Все предметы</button></div></main>';
  }
  const all = S.hw.slice();
  const active = all.filter(h => h.status !== 2);
  const done = all.filter(h => h.status === 2);
  const late = active.filter(h => h.due && h.due < today());
  const soon = active.filter(h => h.due && h.due >= today() && h.due <= addDays(today(), 7));
  const visible = studyFilter === 'done' ? done : studyFilter === 'all' ? all : studyFilter === 'soon' ? soon : active;
  return '<main class="page">' + mydayHeader('Учёба', late.length ? ruCount(late.length, 'долг', 'долга', 'долгов') + ' · сначала они' : (active.length ? ruCount(active.length, 'задание в работе', 'задания в работе', 'заданий в работе') : 'Можно добавить предмет'), true, true) +
    '<div class="study-stats"><div class="study-stat"><b>' + S.subjects.length + '</b><span>предметов</span></div><div class="study-stat"><b>' + active.length + '</b><span>в работе</span></div><div class="study-stat"><b>' + late.length + '</b><span>долги</span></div></div>' +
    mydaySection('Предметы', 'Курс хранит свои задания', '<button class="text-link" type="button" onclick="subjEdit(\'\')">Новый</button>') +
    (S.subjects.length ? '<div class="subject-grid">' + S.subjects.map(s => {
      const H = S.hw.filter(h => h.subj === s.id);
      const d = H.filter(h => h.status === 2).length;
      const o = H.length - d;
      const p = H.length ? Math.round(d / H.length * 100) : 0;
      return '<button class="subject-tile" type="button" onclick="openSubj=\'' + s.id + '\';render()"><span class="subject-icon">' + mydayIcon('book', 18) + '</span><b class="subject-name">' + e(s.name) + '</b><span class="subject-caption">' + (s.closed ? 'Зачёт получен' : (o ? ruCount(o, 'активное', 'активных', 'активных') : 'без активных')) + '</span><span class="progress-track"><span class="progress-fill" style="width:' + p + '%"></span></span></button>';
    }).join('') + '</div>' : mydayEmpty('Нет предметов', 'Сначала курс, потом задания внутри него.')) +
    '<section class="section">' + mydaySection('Задания', 'По сроку, не общей кучей', '<button class="text-link" type="button" onclick="' + (S.subjects.length ? 'hwForm()' : 'subjEdit()') + '">Добавить</button>') +
    '<div class="chip-row">' + [['open', 'Активные', active.length], ['soon', '7 дней', soon.length], ['done', 'Готово', done.length], ['all', 'Все', all.length]].map(([k, l, n]) => '<button class="chip ' + (studyFilter === k ? 'on' : '') + '" type="button" onclick="studyFilter=\'' + k + '\';render()">' + l + ' · ' + n + '</button>').join('') + '</div>' +
    (visible.length ? '<div class="task-list">' + visible.slice().sort((a, b) => (a.status === 2) - (b.status === 2) || (a.due || '9999').localeCompare(b.due || '9999')).map(h => mydayTask({ ...h, k: 'h', title: subj(h.subj) + ': ' + h.title })).join('') + '</div>' : mydayEmpty('В этом списке пусто', 'Смени фильтр или добавь задание.')) + '</section></main>';
};

window.weekView = function () {
  const all = allOpen();
  const days = [...Array(7)].map((_, i) => addDays(today(), i));
  return '<main class="page">' + mydayHeader('План недели', 'Семь дней: пары, задачи и события', false, true) +
    '<div class="week-list">' + days.map(k => {
      const d = new Date(k + 'T12:00');
      const L = lessons(d);
      const T = all.filter(x => x.due === k);
      const E = (S.events || []).filter(x => x.date === k);
      return '<button class="week-day-card" type="button" onclick="cdsel=\'' + k + '\';st=\'cal\';render()"><span class="week-day-date"><b>' + d.getDate() + '</b><small>' + ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()] + '</small></span><span class="week-day-summary"><b>' + DAYS[d.getDay()] + '</b><small>' + L.length + ' пар · ' + T.length + ' задач · ' + E.length + ' событий</small></span><span class="week-day-arrow">' + mydayIcon('chevron', 16) + '</span></button>';
    }).join('') + '</div><button class="btn g" type="button" style="width:100%;margin-top:14px" onclick="st=null;render()">Назад к настройкам</button></main>';
};

window.calView = function () { return window.vMore(); };

window.vMore = function () {
  if (st === 'inbox') {
    return '<main class="page">' + mydayHeader('Идеи и заметки', 'Сначала записать, разобрать потом', false, true) +
      (S.inbox.length ? '<div class="task-list">' + S.inbox.map((n, i) => '<div class="task-item"><span class="settings-icon">' + mydayIcon('inbox', 16) + '</span><button class="task-main" type="button" onclick="toTask(' + i + ')"><span class="task-title">' + e(n.text) + '</span><span class="task-meta">' + e(n.d || 'без даты') + ' · сделать задачей</span></button><button class="icon-btn" type="button" aria-label="Удалить заметку" onclick="S.inbox.splice(' + i + ',1);save();render()">' + mydayIcon('close', 15) + '</button></div>').join('') + '</div>' : mydayEmpty('Входящие пусты', 'Быстрая запись сохранит мысль, не превращая её в обязательство.')) +
      '<div class="schedule-actions"><button class="btn" type="button" onclick="capture()">Записать</button><button class="btn g" type="button" onclick="st=null;render()">Настройки</button></div></main>';
  }
  if (st === 'uni') {
    const u = S.uni || {};
    return '<main class="page">' + mydayHeader('Университет', 'Ссылки и контакты под рукой', false, true) +
      '<section class="surface-panel"><label for="u1">Название</label><input id="u1" value="' + e(u.name) + '"><label for="u2">Сайт или личный кабинет</label><input id="u2" value="' + e(u.url) + '" inputmode="url" autocomplete="url"><label for="u3">Логин</label><input id="u3" value="' + e(u.login) + '" autocomplete="username"><p class="page-sub">Пароль здесь не хранится.</p><label for="u4">Полезные ссылки</label><textarea id="u4">' + e(u.links) + '</textarea><label for="u5">Преподаватели</label><textarea id="u5">' + e(u.teachers) + '</textarea><label for="u6">Заметки</label><textarea id="u6">' + e(u.notes) + '</textarea><button class="btn" type="button" style="width:100%" onclick="saveUni()">Сохранить</button><button class="btn g" type="button" style="width:100%;margin-top:8px" onclick="saveUni();openUni()">Открыть сайт</button><button class="btn g" type="button" style="width:100%;margin-top:8px" onclick="st=null;render()">Назад</button></section></main>';
  }
  if (st === 'cal') {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + (cm || 0));
    const y = base.getFullYear();
    const m = base.getMonth();
    const off = (base.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const items = [...S.tasks.map(x => ({ ...x, k: 't' })), ...S.hw.map(x => ({ ...x, k: 'h', title: subj(x.subj) + ': ' + x.title }))];
    const counts = {};
    items.filter(x => x.due && x.status != 2).forEach(x => { counts[x.due] = (counts[x.due] || 0) + 1; });
    (S.events || []).forEach(x => { counts[x.date] = (counts[x.date] || 0) + 1; });
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<div class="cal-day outside" aria-hidden="true"></div>';
    for (let d = 1; d <= dim; d++) {
      const k = y + '-' + pad(m + 1) + '-' + pad(d);
      const n = counts[k] || 0;
      cells += '<button class="cal-day ' + (k === today() ? 'is-today ' : '') + (k === cdsel ? 'selected' : '') + '" type="button" aria-pressed="' + (k === cdsel) + '" aria-label="' + fmt(k) + '" onclick="cdsel=\'' + k + '\';render()"><b>' + d + '</b>' + (n ? '<i></i>' : '') + '</button>';
    }
    const selected = cdsel ? items.filter(x => x.due === cdsel && x.status != 2) : [];
    const events = cdsel ? (S.events || []).map((x, i) => ({ ...x, index: i })).filter(x => x.date === cdsel) : [];
    return '<main class="page">' + mydayHeader('Календарь', 'Дедлайны, зачёты и свои даты', false, true) +
      '<section class="schedule-control"><div class="calendar-heading"><button class="icon-btn" type="button" aria-label="Предыдущий месяц" onclick="cm--;render()">' + mydayIcon('chevron', 18) + '</button><h2>' + base.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) + '</h2><button class="icon-btn" type="button" aria-label="Следующий месяц" onclick="cm++;render()">' + mydayIcon('chevron', 18) + '</button></div>' +
      '<div class="calendar-grid calendar-weekdays">' + ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => '<span>' + x + '</span>').join('') + '</div><div class="calendar-grid">' + cells + '</div><button class="text-link" type="button" onclick="cdsel=today();cm=0;render()">Сегодня</button></section>' +
      '<section class="section">' + mydaySection(cdsel ? fmt(cdsel) : 'День', cdsel ? (selected.length + ' дел · ' + events.length + ' событий') : 'Выбери дату') +
      (cdsel && selected.length ? '<div class="task-list">' + selected.map(mydayTask).join('') + '</div>' : (cdsel ? mydayEmpty('Дедлайнов нет', 'На эту дату ничего не назначено.') : '')) +
      (events.length ? '<div class="event-list">' + events.map(x => '<div class="event-row"><span class="event-mark"></span><span class="event-copy"><b>' + e(x.title) + '</b><small>' + e(x.type || 'Событие') + '</small></span><button class="icon-btn" type="button" aria-label="Удалить событие" onclick="evDel(' + x.index + ')">' + mydayIcon('close', 15) + '</button></div>').join('') + '</div>' : '') +
      '<button class="btn" type="button" style="width:100%;margin-top:12px" onclick="cdsel=cdsel||today();evForm()">Событие или экзамен</button></section></main>';
  }
  if (st === 'week') return window.weekView();
  if (st === 'stats') {
    const days = [...Array(7)].map((_, i) => addDays(today(), i - 6));
    const all = [...S.tasks, ...S.hw];
    const count = d => all.filter(x => x.doneAt === d).length;
    const values = days.map(count);
    const max = Math.max(1, ...values);
    const finished = all.filter(x => x.status == 2).length;
    const open = all.length - finished;
    const late = all.filter(x => x.status != 2 && x.due && x.due < today()).length;
    const focus = (S.focus || []).filter(x => x.d >= days[0]).reduce((a, x) => a + (Number(x.m) || 0), 0);
    return '<main class="page">' + mydayHeader('Статистика', 'Без очков и серий — только факт', false, true) +
      '<div class="metric-grid"><div class="metric-tile"><span class="metric-label">Закрыто</span><b class="metric-value">' + finished + '</b></div><div class="metric-tile"><span class="metric-label">Открыто</span><b class="metric-value">' + open + '</b></div><div class="metric-tile"><span class="metric-label">Долги</span><b class="metric-value ' + (late ? 'danger' : '') + '">' + late + '</b></div></div>' +
      '<section class="section">' + mydaySection('Семь дней', 'Сколько дел закрыто') + '<div class="stats-bars">' + values.map((n, i) => '<div class="stats-bar-col"><span>' + n + '</span><span class="stats-bar-track"><i style="height:' + Math.max(6, n / max * 100) + '%"></i></span><small>' + new Date(days[i] + 'T12:00').toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '').slice(0, 2) + '</small></div>').join('') + '</div></section>' +
      '<section class="section">' + mydaySection('Фокус') + '<div class="surface-panel"><b class="metric-value">' + Math.floor(focus / 60) + ' ч ' + (focus % 60) + ' мин</b><p class="page-sub">Таймер считается, пока MYDAY открыт.</p></div></section>' +
      '<section class="section">' + mydaySection('Предметы') + (S.subjects.filter(s => !s.closed).map(s => {
        const H = S.hw.filter(h => h.subj === s.id);
        const n = H.filter(h => h.status == 2).length;
        const p = H.length ? Math.round(n / H.length * 100) : 0;
        return '<div class="progress-row"><div><b>' + e(s.name) + '</b><small>' + n + ' из ' + H.length + '</small></div><span class="progress-track"><span class="progress-fill" style="width:' + p + '%"></span></span></div>';
      }).join('') || mydayEmpty('Предметов нет', 'Они появятся из раздела «Учёба».')) + '</section>' +
      '<button class="btn g" type="button" style="width:100%" onclick="st=null;render()">Назад</button></main>';
  }
  const M = S.settings || {};
  const tools = [
    ['uni', 'Университет', 'Кабинет, ссылки, преподаватели', 'uni'],
    ['week', 'План недели', 'Нагрузка на семь дней', 'calendar'],
    ['cal', 'Календарь', 'Дедлайны и экзамены по датам', 'calendar'],
    ['stats', 'Статистика', 'Что закрыто за неделю', 'stats'],
    ['inbox', 'Идеи и заметки', S.inbox.length ? ruCount(S.inbox.length, 'заметка', 'заметки', 'заметок') : 'Пусто', 'inbox'],
    ['documents', 'Разбор документов', 'PDF, сканы и фото с ИИ', 'book']
  ];
  const accentNames = ['Хвоя', 'Чернила', 'Глина', 'Песок', 'Слива'];
  const palette = [
    ['#1f6a4d', '#164e39'],
    ['#3d4f66', '#2c3b4e'],
    ['#a24b2d', '#7d3820'],
    ['#8d6a2f', '#6d5122'],
    ['#6e4c72', '#523858']
  ];
  return '<main class="page">' + mydayHeader('Настройки', 'Тема, неделя, напоминания и копия данных', false, true) +
    '<section class="section">' + mydaySection('Разделы') + '<div class="settings-list">' + tools.map(([id, title, desc, icon]) => { const action = id === 'documents' ? "location.href='./ocr.html?v=20261127-4'" : "st='" + id + "';render()"; return '<button class="settings-card" type="button" onclick="' + action + '"><span class="settings-icon">' + mydayIcon(icon) + '</span><span class="settings-copy"><b>' + title + '</b><small>' + desc + '</small></span><span class="settings-arrow">' + mydayIcon('chevron', 16) + '</span></button>'; }).join('') + '</div></section>' +
    '<section class="section">' + mydaySection('Внешний вид') + '<div class="surface-panel"><div class="theme-options"><button type="button" class="' + (M.theme === 'light' ? 'on' : '') + '" onclick="setTheme(\'light\')"><span class="theme-option-icon">' + mydayIcon('sun', 18) + '</span><b>Светлая</b></button><button type="button" class="' + (M.theme === 'dark' ? 'on' : '') + '" onclick="setTheme(\'dark\')"><span class="theme-option-icon">' + mydayIcon('moon', 18) + '</span><b>Тёмная</b></button><button type="button" class="' + ((M.theme || 'auto') === 'auto' ? 'on' : '') + '" onclick="setTheme(\'auto\')"><span class="theme-option-icon">' + mydayIcon('system', 18) + '</span><b>Система</b></button></div><label for="ui-accent">Акцент</label><select id="ui-accent" onchange="S.settings.accent=+this.value;save();render()">' + palette.map((c, i) => '<option value="' + i + '" ' + ((Number(M.accent) || 0) === i ? 'selected' : '') + '>' + accentNames[i] + '</option>').join('') + '</select></div></section>' +
    '<section class="section">' + mydaySection('Расписание') + '<div class="surface-panel"><label for="ui-week">Какая сейчас неделя</label><select id="ui-week" onchange="setWeekType(this.value)"><option value="odd" ' + (wk() === 'odd' ? 'selected' : '') + '>Нижняя · нечётная</option><option value="even" ' + (wk() === 'even' ? 'selected' : '') + '>Верхняя · чётная</option></select><p class="page-sub">С понедельника тип переключается сам. Здесь можно поправить.</p></div></section>' +
    '<section class="section">' + mydaySection('Напоминания') + '<div class="surface-panel"><label for="ui-morning">Утро</label><input id="ui-morning" type="time" value="' + e(M.morning || '08:00') + '" onchange="S.settings.morning=this.value;save()"><label for="ui-delay">Спросить про домашку через, минут после последней пары</label><input id="ui-delay" type="number" min="0" max="240" step="5" value="' + (Number(M.hwDelay) || 0) + '" onchange="S.settings.hwDelay=Math.max(0,Math.min(240,+this.value||0));save()"><label style="display:flex;gap:10px;align-items:center"><input type="checkbox" style="width:auto" ' + (M.notif === false ? '' : 'checked') + ' onchange="S.settings.notif=this.checked;save()"> Показывать напоминания</label><button class="btn g" type="button" style="width:100%;margin-top:8px" onclick="askNotif()">Разрешить уведомления</button><p class="page-sub">Пока приложение открыто. iOS может остановить таймеры в фоне.</p></div></section>' +
    '<section class="section">' + mydaySection('Облако') + '<div class="surface-panel"><p class="page-sub" role="status" aria-live="polite" data-cloud-status>' + e(cloudStatus) + '</p><p class="page-sub">' + (tgUserId ? 'Профиль Telegram привязан.' : 'Открой MYDAY из Telegram, чтобы синхронизировать личный профиль.') + '</p><button class="btn g" type="button" style="width:100%;margin-top:8px" onclick="retryCloud()">Проверить соединение</button>' +
    (cloudConflict ? '<div class="row" style="margin-top:10px"><button class="btn g grow" type="button" onclick="acceptCloudRemote()">Облачная версия</button><button class="btn grow" type="button" onclick="keepLocalVersion()">Оставить мою</button></div>' : '') +
    (cloudConflictBackupAvailable ? '<button class="btn g" type="button" style="width:100%;margin-top:8px" onclick="downloadCloudConflict()">Скачать локальную копию</button>' : '') + '</div></section>' +
    '<section class="section">' + mydaySection('Данные') + '<div class="settings-list"><button class="settings-card" type="button" onclick="exp()"><span class="settings-icon">' + mydayIcon('inbox') + '</span><span class="settings-copy"><b>Экспорт</b><small>JSON со всем профилем</small></span><span class="settings-arrow">' + mydayIcon('chevron', 16) + '</span></button><button class="settings-card" type="button" onclick="imp()"><span class="settings-icon">' + mydayIcon('calendar') + '</span><span class="settings-copy"><b>Импорт</b><small>Восстановить из файла</small></span><span class="settings-arrow">' + mydayIcon('chevron', 16) + '</span></button><button class="settings-card" type="button" onclick="restoreBak()"><span class="settings-icon">' + mydayIcon('clock') + '</span><span class="settings-copy"><b>Автокопия сеанса</b><small>Вернуть начало этой сессии</small></span><span class="settings-arrow">' + mydayIcon('chevron', 16) + '</span></button><button class="settings-card" type="button" onclick="reset()"><span class="settings-icon">' + mydayIcon('close') + '</span><span class="settings-copy"><b>Сбросить данные</b><small>Только после двух подтверждений</small></span><span class="settings-arrow">' + mydayIcon('chevron', 16) + '</span></button></div></section></main>';
};

window.render = function () {
  const th = resolvedTheme();
  const root = document.documentElement;
  root.dataset.theme = th;
  const light = [
    ['#1f6a4d', '#164e39'],
    ['#3d4f66', '#2c3b4e'],
    ['#a24b2d', '#7d3820'],
    ['#8d6a2f', '#6d5122'],
    ['#6e4c72', '#523858']
  ];
  const dark = [
    ['#8dceb0', '#b7e4cf'],
    ['#b7c7dc', '#d5e0ee'],
    ['#e7b09a', '#f3d2c4'],
    ['#e6c98a', '#f3e2bc'],
    ['#d7b4dc', '#edd4f0']
  ];
  const accent = (th === 'dark' ? dark : light)[Math.max(0, Math.min(4, Number(S.settings.accent) || 0))];
  root.style.setProperty('--accent', accent[0]);
  root.style.setProperty('--accent-2', accent[1]);
  root.style.setProperty('--ac', accent[0]);
  root.style.setProperty('--ac2', accent[1]);
  root.style.setProperty('--accent-soft', 'color-mix(in srgb, ' + accent[0] + ' 16%, var(--surface))');
  const pageColor = th === 'light' ? '#efeae2' : '#12110f';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = pageColor;
  try {
    tgApp && tgApp.setHeaderColor && tgApp.setHeaderColor(pageColor);
    tgApp && tgApp.setBackgroundColor && tgApp.setBackgroundColor(pageColor);
    tgApp && tgApp.setBottomBarColor && tgApp.setBottomBarColor(pageColor);
  } catch (_) {}
  const tabs = [['today', 'today', 'Сегодня'], ['sched', 'sched', 'План'], ['tasks', 'tasks', 'Задачи'], ['study', 'study', 'Учёба'], ['more', 'more', 'Ещё']];
  document.querySelector('#nav').innerHTML = tabs.map(([key, icon, label]) => '<button class="' + (tab === key ? 'on' : '') + '" type="button" aria-current="' + (tab === key ? 'page' : 'false') + '" aria-label="' + label + '" onclick="go(\'' + key + '\')"><b>' + mydayIcon(icon, 22) + '</b><span>' + label + '</span></button>').join('');
  document.querySelector('#app').innerHTML = ({ today: window.vToday, sched: window.vSched, tasks: window.vTasks, study: window.vStudy, more: window.vMore })[tab]();
  if (typeof enhanceActionSemantics === 'function') enhanceActionSemantics();
  const vk = tab + '|' + st + '|' + openSubj + '|' + sd + '|' + (cdsel || '');
  if (vk !== window._vk) {
    window._vk = vk;
    const a = document.querySelector('#app');
    a.classList.remove('in');
    void a.offsetWidth;
    a.classList.add('in');
  }
};

window.sheet = function (h) {
  const old = document.querySelector('#ov');
  const replacing = !!old;
  if (old) old.remove();
  else {
    window._dialogTrigger = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    window._dialogOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  const o = document.createElement('div');
  o.className = 'ov' + (replacing ? ' nos' : '');
  o.id = 'ov';
  o.addEventListener('click', ev => { if (ev.target === o) close_(); });
  o.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="grab" aria-hidden="true"></div><button class="sheet-close" type="button" aria-label="Закрыть" onclick="close_()">' + mydayIcon('close', 16) + '</button>' + h + '</div>';
  document.body.appendChild(o);
  const panel = o.querySelector('.sheet');
  const title = panel.querySelector('h1');
  if (title) {
    title.id = title.id || 'dialog-title';
    panel.setAttribute('aria-labelledby', title.id);
    title.tabIndex = -1;
  } else panel.setAttribute('aria-label', 'Диалог');
  panel.querySelectorAll('label').forEach(l => {
    if (l.htmlFor || l.querySelector('input,select,textarea')) return;
    const f = l.nextElementSibling;
    if (f && f.matches('input,select,textarea')) {
      if (!f.id) f.id = 'field-' + id();
      l.htmlFor = f.id;
    }
  });
  panel.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); close_(); return; }
    if (ev.key !== 'Tab') return;
    const a = [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
    if (!a.length) { ev.preventDefault(); panel.focus(); return; }
    if (ev.shiftKey && document.activeElement === a[0]) { ev.preventDefault(); a[a.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === a[a.length - 1]) { ev.preventDefault(); a[0].focus(); }
  });
  setTimeout(() => { if (o.isConnected) (title || panel).focus({ preventScroll: true }); }, 20);
};

window.close_ = function () {
  const o = document.querySelector('#ov');
  if (!o) return;
  o.classList.add('bye');
  setTimeout(() => {
    o.remove();
    document.body.style.overflow = window._dialogOverflow || '';
    const t = window._dialogTrigger;
    window._dialogTrigger = null;
    if (t && t.isConnected) t.focus({ preventScroll: true });
  }, 180);
};

window.capture = function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceButton = SR ? '<button class="btn g" type="button" onclick="voice()">' + mydayIcon('mic', 16) + ' Голос</button>' : '';
  sheet('<h1>Быстрая запись</h1><p class="page-sub">Любой текст можно сохранить во входящие и разобрать позже.</p><textarea id="cq" oninput="capHint()" placeholder="Напиши что угодно: мысль, просьбу, идею, ссылку, черновик…"></textarea><div id="chint" style="min-height:22px;margin:6px 0"></div><div id="tpl" style="margin-bottom:8px">' + tplHtml() + '</div><label for="cd">Срок (необязательно)</label><input type="date" id="cd">' + dch('cd') + '<label for="capture-kind">Сохранить как</label><select id="capture-kind"><option value="i" selected>Входящие · любой текст</option><option value="t">Задача</option></select><div class="row">' + voiceButton + '<button class="btn g" type="button" onclick="tplAdd()">В шаблоны</button><button class="btn grow" type="button" onclick="capSave()">Сохранить</button></div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="cs" style="width:auto" onchange="capHint()"> Разбить на отдельные задачи</label>');
  const kind = document.querySelector('#capture-kind');
  if (kind) kind.value = 'i';
}

window.MYDAY_APPLE_UI_PENDING = false;
window.render();
