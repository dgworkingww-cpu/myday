const fs = require('node:fs');
const assert = require('node:assert/strict');

const source = fs.readFileSync('schedule-lab.js', 'utf8');
const parseLineStart = source.indexOf('function parseLine(line,context)');
const groupStart = source.indexOf('function groupLabel(value)');
const normalizeClockStart = source.indexOf('function normalizeClock(value)');
const parseDateStart = source.indexOf('function parseDate(value)');
const extractStart = source.indexOf('async function extractFile(file)');
assert(parseLineStart >= 0 && groupStart > parseLineStart && normalizeClockStart > groupStart && parseDateStart > normalizeClockStart && extractStart > parseDateStart, 'Parser functions not found in schedule-lab.js');

const parserSource = source.slice(parseLineStart, groupStart) + '\n' + source.slice(groupStart, normalizeClockStart);
const DAY_NAMES = {'вс':0,'воскресенье':0,'пн':1,'понедельник':1,'вт':2,'вторник':2,'ср':3,'среда':3,'ср.':3,'чт':4,'четверг':4,'пт':5,'пятница':5,'сб':6,'суббота':6};
const timeRegex = /([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)/;
const normalizeTime = (h,m) => String(Number(h)).padStart(2,'0') + ':' + m;
const normalizeClock = value => {
  const m = String(value || '').match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  return m ? normalizeTime(m[1],m[2]) : '';
};
const parseDate = value => {
  const v=String(value||'').trim();
  let m=v.match(/^(20\d{2})[-.](\d{1,2})[-.](\d{1,2})$/);
  if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  m=v.match(/^(\d{1,2})[.](\d{1,2})[.](20\d{2})$/);
  return m?m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):'';
};
let nextId=0;
const id=()=>String(++nextId);
const parser = new Function('DAY_NAMES','timeRegex','normalizeTime','normalizeClock','parseDate','id', parserSource + '\nreturn {parseRows,groupLabel};')(
  DAY_NAMES,timeRegex,normalizeTime,normalizeClock,parseDate,id
);

const universityMatrix = [
  ['День и время','ПИ-21','АТ-22','ЭК-23'],
  ['Понедельник 09:00-10:30','Математика','Физика','История'],
  ['Понедельник 10:40-12:10','История','Химия','Математика'],
  ['Вторник 09:00-10:30','Физика','Математика','Программирование'],
  ['Среда 11:00-12:30','Программирование','История','Физика']
];
const all = parser.parseRows(universityMatrix);
assert.deepEqual([...new Set(all.map(x=>x.group))].sort(), ['АТ-22','ПИ-21','ЭК-23']);
const pi = all.filter(x=>x.group==='ПИ-21');
assert.equal(pi.length,4);
assert.deepEqual(pi.map(x=>x.subj),['Математика','История','Физика','Программирование']);
assert(!pi.some(x=>['Химия','История'].includes(x.subj) && x.group!=='ПИ-21'));

const rowTable = [
  ['День','Время','Группа','Предмет','Аудитория'],
  ['Понедельник','09:00-10:30','ПИ-21','Математика','101'],
  ['Понедельник','09:00-10:30','АТ-22','Физика','202']
];
const rows = parser.parseRows(rowTable);
assert.equal(rows.length,2);
assert.equal(rows.find(x=>x.group==='ПИ-21').subj,'Математика');
assert.equal(rows.find(x=>x.group==='АТ-22').subj,'Физика');

const sheetRows = [['День','Время','Предмет'],['Понедельник','09:00-10:30','Алгебра']];
const sheet = parser.parseRows(sheetRows,{defaultGroup:'ПИ-21'});
assert.equal(sheet.length,1);
assert.equal(sheet[0].group,'ПИ-21');

const personal = parser.parseRows(sheetRows);
assert.equal(personal.length,1);
assert.equal(personal[0].group,'');

console.log('Group import parser tests passed: matrix headers, row-based group column, workbook sheet name and personal schedule.');
