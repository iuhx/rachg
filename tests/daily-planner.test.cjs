const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label, elements } = require('./component-fixture.cjs');
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const task = (extra = {}) => ({ id: crypto.randomUUID(), date: '2026-10-13', text: 'A useful task', ...extra });
const create = (f, value) => f.request('/v1/todos', json('POST', value));
const withFixture = fn => async () => { const f = fixture(); try { await fn(f); } finally { await f.close(); } };

test('daily tasks persist by date with completion history and calendar counts', withFixture(async f => {
  const input = task();
  const first = (await (await create(f, input)).json()).todo;
  assert.equal(first.completed, false); assert.equal(first.date, input.date);
  await create(f, task({ date: '2026-10-14' }));
  const completed = (await (await f.request(`/v1/todos/${first.id}`, json('PUT', { date: first.date, revision: first.revision, completed: true }))).json()).todo;
  assert.equal(completed.completed, true); assert.equal(completed.revision, 2);
  assert.equal((await (await create(f, input)).json()).todo.completed, true, 'A creation retry must not uncheck a saved task');
  const history = (await (await f.request('/v1/todos?date=2026-10-13')).json()).todos;
  assert.equal(history.length, 1); assert.equal(history[0].completed, true);
  assert.deepEqual((await (await f.request('/v1/todos?month=2026-10')).json()).days, [
    { date: '2026-10-13', total: 1, completed: 1 }, { date: '2026-10-14', total: 1, completed: 0 },
  ]);
  assert.deepEqual((await (await f.request('/v1/todos?date=2026-10-15')).json()).todos, []);
}));

test('stale and cross-day changes cannot overwrite tasks; deletion requires the current revision', withFixture(async f => {
  const todo = (await (await create(f, task())).json()).todo;
  const path = `/v1/todos/${todo.id}`;
  assert.equal((await f.request(path, json('PUT', { date: '2026-10-14', revision: 1, completed: true }))).status, 409);
  const responses = await Promise.all([f.request(path, json('PUT', { date: todo.date, revision: 1, completed: true })), f.request(path, json('PUT', { date: todo.date, revision: 1, completed: false }))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  assert.equal((await f.request(path, json('DELETE', { date: todo.date, revision: 1 }))).status, 409);
  assert.equal((await f.request(path, json('DELETE', { date: todo.date, revision: 2 }))).status, 200);
  assert.equal((await f.request(path, json('DELETE', { date: todo.date, revision: 2 }))).status, 200);
  assert.equal((await (await f.request('/v1/todos?date=2026-10-13')).json()).todos.length, 0);
}));

test('task endpoints enforce authentication, Origin, real dates, text and atomic daily capacity', withFixture(async f => {
  assert.equal((await f.worker.fetch(new Request('https://fixture.invalid/v1/todos?date=2026-10-13'), f.env, f.ctx)).status, 401);
  assert.equal((await f.request('/v1/todos', { ...json('POST', task()), headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' } })).status, 403);
  for (const input of [task({ date: '2026-02-29' }),task({ date: '2024-02-30' }),task({ text: '' }),task({ text: 'a'.repeat(301) }),task({ id: 'fake' })]) assert.equal((await create(f, input)).status, 400);
  assert.equal((await f.request('/v1/todos?month=2026-13')).status, 400);
  assert.equal((await create(f, task({ date: '2024-02-29' }))).status, 200);
  const insert = f.sqlite.prepare('INSERT INTO daily_todos (id,day,text,created_at,updated_at) VALUES (?,?,?,?,?)');
  for(let i=0;i<99;i++) insert.run(crypto.randomUUID(),'2026-10-13',`task ${i}`,i,i);
  const outcomes = await Promise.all([create(f,task()),create(f,task())]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM daily_todos WHERE day='2026-10-13'").get().n,100);
}));

test('calendar handles Monday-first leap months, year boundaries and Chinese lunar new year', () => {
  const f = components(), calendar = f.load('apps/workspace/src/utils/calendar.ts');
  const days = calendar.monthDays('2024-02');
  assert.equal(days.length,42); assert.equal(days[0],'2024-01-29');
  assert.equal(days.filter(day=>day.startsWith('2024-02')).length,29);
  assert.equal(calendar.shiftMonth('2026-12',1),'2027-01');
  assert.equal(calendar.shiftMonth('2026-01',-1),'2025-12');
  assert.match(calendar.lunarDate('2026-02-17'), /正月初一/);
});

test('calendar falls back to Gregorian dates when Chinese calendar support is absent', t => {
  const original = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function(locale, options) { if (String(locale).includes('chinese')) throw new RangeError('unsupported'); return new original(locale, options); };
  t.after(()=>{Intl.DateTimeFormat=original;});
  const calendar = components().load('apps/workspace/src/utils/calendar.ts');
  assert.equal(calendar.lunarDate('2026-02-17'),''); assert.equal(calendar.monthDays('2026-02').length,42);
});

const flush = () => new Promise(resolve => setImmediate(resolve));
test('calendar follows midnight only while Today is selected and preserves per-date drafts', async () => {
  const f=components(),{DailyPlanner}=f.load('apps/workspace/src/components/DailyPlanner.tsx');
  const props={now:new Date(2026,9,13,23,59),canManage:true}; const h=f.mount(DailyPlanner,props);
  const todo=()=>find(h,n=>n.type?.name==='DailyTodos').props;
  assert.equal(todo().date,'2026-10-13'); todo().onDraftChange('Today draft');h.render();
  find(h,n=>n.props['data-calendar-day']==='2026-10-12').props.onClick();h.render();
  todo().onDraftChange('History draft');h.render();
  props.now=new Date(2026,9,14,0,1);h.render();assert.equal(todo().date,'2026-10-12');assert.equal(todo().draft.text,'History draft');
  find(h,n=>n.props['data-calendar-day']==='2026-10-13').props.onClick();h.render();assert.equal(todo().draft.text,'Today draft');
  find(h,n=>n.type==='button'&&label(n)==='Today').props.onClick();h.render();assert.equal(todo().date,'2026-10-14');
  props.now=new Date(2026,9,15,0,1);h.render();assert.equal(todo().date,'2026-10-15');
  await flush();h.unmount();
});

test('late task reads cannot replace another date; failures keep a retryable draft and stable creation ID', async () => {
  const f=components(); let releaseOld, creates=0;
  f.services.todoService.fetchTodos=date=>date==='2026-10-13'?new Promise(resolve=>releaseOld=resolve):Promise.resolve([]);
  const {DailyTodos}=f.load('apps/workspace/src/components/DailyTodos.tsx');
  const draft={id:crypto.randomUUID(),text:'Keep this draft'};let cleared;
  const props={date:'2026-10-13',today:'2026-10-14',canManage:true,draft,onDraftChange(){},onCreated:id=>cleared=id,onChanged(){}};
  const h=f.mount(DailyTodos,props);props.date='2026-10-14';h.render();await flush();h.render();
  releaseOld([{...task(),completed:false,revision:1,createdTimestamp:1}]);await flush();h.render();assert.doesNotMatch(label(h.tree),/A useful task/);
  f.services.todoService.createTodo=async(id,date,text)=>{creates++;assert.equal(id,draft.id);assert.equal(date,'2026-10-14');if(creates===1)throw new Error('Connection lost');return{id,date,text,completed:false,revision:1,createdTimestamp:1};};
  const submit=()=>find(h,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  submit();submit();await flush();h.render();assert.equal(creates,1);assert.equal(cleared,undefined);
  submit();await flush();h.render();assert.equal(creates,2);assert.equal(cleared,draft.id);h.unmount();
});
