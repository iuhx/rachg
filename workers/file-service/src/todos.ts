import { isCalendarDate, TODO_LIMITS, type TodoItem } from '@rachg/shared';
import { boundedJson, InputError } from '../../common/content';

interface TodoRecord { id: string; day: string; text: string; completed: number; revision: number; created_at: number; updated_at: number }
const ready = new WeakMap<D1Database, Promise<void>>();
async function ensureTodos(db: D1Database) {
  let pending = ready.get(db);
  if (!pending) {
    pending = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS daily_todos (
        id TEXT PRIMARY KEY, day TEXT NOT NULL, text TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
        revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_daily_todos_day ON daily_todos(day,created_at,id)').run();
    })().catch(error => { ready.delete(db); throw error; });
    ready.set(db, pending);
  }
  await pending;
}
function mapTodo(row: TodoRecord): TodoItem {
  return { id: row.id, date: row.day, text: row.text, completed: row.completed === 1,
    revision: row.revision, createdTimestamp: row.created_at, updatedTimestamp: row.updated_at };
}

/** The main Worker performs administrator JWT and Origin checks first. */
export async function routeTodos(request: Request, db: D1Database) {
  const url = new URL(request.url), method = request.method;
  const match = url.pathname.match(/^\/v1\/todos(?:\/([a-f0-9-]{36}))?$/i);
  if (!match) throw new InputError('Not found', 404);
  const id = match[1];
  if (!id && method === 'GET') {
    const day = url.searchParams.get('date'), month = url.searchParams.get('month');
    if (day && !month && isCalendarDate(day)) {
      await ensureTodos(db);
      const result = await db.prepare('SELECT * FROM daily_todos WHERE day=? ORDER BY completed,created_at,id').bind(day).all<TodoRecord>();
      return { success: true, todos: result.results.map(mapTodo) };
    }
    if (month && !day && /^\d{4}-\d{2}$/.test(month) && isCalendarDate(`${month}-01`)) {
      await ensureTodos(db);
      const result = await db.prepare('SELECT day AS date,COUNT(*) AS total,SUM(completed) AS completed FROM daily_todos WHERE day>=? AND day<=? GROUP BY day ORDER BY day')
        .bind(`${month}-01`, `${month}-31`).all();
      return { success: true, days: result.results };
    }
    throw new InputError('Choose a valid date or month.');
  }
  if ((!id && method !== 'POST') || (id && !['PUT','DELETE'].includes(method))) throw new InputError('Method not allowed', 405);
  const body = await boundedJson(request) as Record<string, unknown> | null;
  if (!body || !isCalendarDate(body.date)) throw new InputError('A valid date is required.');
  if (!id) {
    if (typeof body.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.id) ||
        typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > TODO_LIMITS.text) throw new InputError(`Enter a task of 1–${TODO_LIMITS.text} characters and a valid creation ID.`);
  } else if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1 || (method === 'PUT' && typeof body.completed !== 'boolean')) throw new InputError('A valid revision and completion state are required.');
  await ensureTodos(db);
  if (!id) {
    const text = (body.text as string).trim(), now = Date.now();
    const result = await db.prepare(`INSERT INTO daily_todos (id,day,text,created_at,updated_at)
      SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM daily_todos WHERE day=?) < ? ON CONFLICT(id) DO NOTHING RETURNING *`)
      .bind(body.id, body.date, text, now, now, body.date, TODO_LIMITS.perDay).first<TodoRecord>();
    if (result) return { success: true, todo: mapTodo(result) };
    const existing = await db.prepare('SELECT * FROM daily_todos WHERE id=?').bind(body.id).first<TodoRecord>();
    if (existing && existing.day === body.date && existing.text === text) return { success: true, todo: mapTodo(existing) };
    throw new InputError(existing ? 'This task was already created with different content. Refresh before retrying.' : `A day can contain up to ${TODO_LIMITS.perDay} tasks.`, 409);
  }
  if (method === 'PUT') {
    const row = await db.prepare(`UPDATE daily_todos SET completed=?,revision=revision+1,updated_at=MAX(updated_at+1,?) WHERE id=? AND day=? AND revision=? RETURNING *`)
      .bind(body.completed ? 1 : 0, Date.now(), id, body.date, body.revision).first<TodoRecord>();
    if (row) return { success: true, todo: mapTodo(row) };
  } else {
    const result = await db.prepare('DELETE FROM daily_todos WHERE id=? AND day=? AND revision=?').bind(id, body.date, body.revision).run();
    if ((result.meta?.changes ?? 0) > 0) return { success: true, id };
    const existing = await db.prepare('SELECT id FROM daily_todos WHERE id=?').bind(id).first();
    if (!existing) return { success: true, id };
  }
  throw new InputError('This task changed in another tab. Refresh the day before trying again.', 409);
}
