import { boundedJson, InputError } from '../../common/content';
import { ensureSchema, getNoteRecordById, mapRecordToNoteItem } from './db';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function categoryId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !uuid.test(value)) throw new InputError('Invalid category.');
  return value;
}
export function categoryName(value: unknown): { name: string; key: string } {
  if (typeof value !== 'string') throw new InputError('A category name is required.');
  const name = value.normalize('NFKC').trim();
  if (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw new InputError('Category names must be 1–40 characters without control characters.');
  return { name, key: name.toLowerCase() };
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InputError('A valid revision is required.');
  return value;
}
export async function listNoteCategories(db: D1Database) {
  await ensureSchema(db);
  return (await db.prepare('SELECT id, name, revision FROM note_categories ORDER BY name_key, id').all()).results;
}

/** Private routes, dispatched only after administrator JWT and Origin validation. */
export async function routeNoteCategories(request: Request, db: D1Database, id?: string) {
  await ensureSchema(db);
  if (!id && request.method === 'GET') return { success: true, categories: await listNoteCategories(db) };
  if (id) categoryId(id);
  if ((!id && request.method !== 'POST') || (id && !['PUT', 'DELETE'].includes(request.method))) throw new InputError('Method not allowed', 405);
  const body = await boundedJson(request) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw new InputError('Invalid category request.');
  if (!id) {
    const newId = categoryId(body.id);
    if (!newId) throw new InputError('A category ID is required.');
    const { name, key } = categoryName(body.name), now = Date.now();
    await db.prepare(`INSERT INTO note_categories (id, name, name_key, created_at, updated_at)
      SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM note_categories) < 50 ON CONFLICT DO NOTHING`)
      .bind(newId, name, key, now, now).run();
    const saved = await db.prepare('SELECT id, name_key FROM note_categories WHERE id = ?').bind(newId).first<{id: string; name_key: string}>();
    if (!saved || saved.name_key !== key) throw new InputError('That category already exists, or the 50-category limit was reached. Refresh and try again.', 409);
  } else if (request.method === 'PUT') {
    const { name, key } = categoryName(body.name);
    const result = await db.prepare(`UPDATE note_categories SET name = ?, name_key = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM note_categories WHERE name_key = ? AND id != ?)`)
      .bind(name, key, Date.now(), id, revision(body.revision), key, id).run();
    if (!result.meta.changes) throw new InputError('The category changed or that name already exists. Refresh and try again.', 409);
  } else {
    const expected = revision(body.revision);
    // Both statements run in one D1 transaction. A stale delete changes nothing.
    const [, deleted] = await db.batch([
      db.prepare(`UPDATE note_organization SET category_id = NULL, revision = revision + 1
        WHERE category_id = ? AND EXISTS (SELECT 1 FROM note_categories WHERE id = ? AND revision = ?)`)
        .bind(id, id, expected),
      db.prepare('DELETE FROM note_categories WHERE id = ? AND revision = ?').bind(id, expected),
    ]);
    if (!deleted.meta.changes) throw new InputError('The category changed. Refresh and try again.', 409);
  }
  return { success: true, categories: await listNoteCategories(db) };
}

export async function routeNoteOrganization(request: Request, db: D1Database, id: string) {
  if (request.method !== 'PUT') throw new InputError('Method not allowed', 405);
  const body = await boundedJson(request) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || typeof body.pinned !== 'boolean' || !('categoryId' in body)) throw new InputError('A category and pin state are required.');
  const target = categoryId(body.categoryId), expected = revision(body.revision);
  await ensureSchema(db);
  const result = await db.prepare(`INSERT INTO note_organization (note_id, category_id, pinned, revision)
    SELECT ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM notes WHERE id = ?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM note_categories WHERE id = ?))
      AND (? = 0 OR EXISTS (SELECT 1 FROM note_organization WHERE note_id = ?))
    ON CONFLICT(note_id) DO UPDATE SET category_id = excluded.category_id,
      pinned = excluded.pinned, revision = note_organization.revision + 1
      WHERE note_organization.revision = ?`)
    .bind(id, target, Number(body.pinned), id, target, target, expected, id, expected).run();
  if (!result.meta.changes) throw new InputError('The note or category changed. Refresh organization and try again.', 409);
  const note = await getNoteRecordById(db, id);
  if (!note) throw new InputError('Note not found', 404);
  return { success: true, note: mapRecordToNoteItem(note) };
}
