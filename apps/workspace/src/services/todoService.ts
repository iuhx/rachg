import { isCalendarDate, TODO_LIMITS, type TodoItem, type TodoDaySummary } from '@rachg/shared';
import { API_BASE_URL } from '../config/api';
import { AuthenticationRequiredError } from './fileService';

async function request(query: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}/v1/todos${query}`, { ...options, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  if ([0, 302, 401, 403].includes(response.status) || response.type === 'opaqueredirect' || response.redirected) throw new AuthenticationRequiredError();
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(data?.error || 'Unable to load or save tasks. Reconnect and retry.');
  return data;
}
function validTodo(todo: TodoItem) {
  return todo && typeof todo.id === 'string' && isCalendarDate(todo.date) && typeof todo.text === 'string' && todo.text.length <= TODO_LIMITS.text &&
    typeof todo.completed === 'boolean' && Number.isSafeInteger(todo.revision) && todo.revision > 0;
}
export async function fetchTodos(date: string): Promise<TodoItem[]> {
  const data = await request(`?date=${encodeURIComponent(date)}`);
  if (!Array.isArray(data.todos) || !data.todos.every((todo: TodoItem) => validTodo(todo) && todo.date === date)) throw new Error('Invalid task response. Refresh this day.');
  return data.todos;
}
export async function fetchTodoMonth(month: string): Promise<TodoDaySummary[]> {
  const data = await request(`?month=${encodeURIComponent(month)}`);
  if (!Array.isArray(data.days) || !data.days.every((day: TodoDaySummary) => isCalendarDate(day.date) && day.date.startsWith(`${month}-`) && Number.isSafeInteger(day.total) && day.total >= 0 && Number.isSafeInteger(day.completed) && day.completed >= 0 && day.completed <= day.total)) throw new Error('Unable to load calendar task counts.');
  return data.days;
}
async function saved(query: string, body: unknown, method: string): Promise<TodoItem> {
  const data = await request(query, { method, body: JSON.stringify(body) });
  if (!validTodo(data.todo)) throw new Error('Unable to confirm the saved task. Refresh before retrying.');
  return data.todo;
}
export async function createTodo(id: string, date: string, text: string): Promise<TodoItem> {
  const todo = await saved('', { id, date, text }, 'POST');
  if (todo.id !== id || todo.date !== date || todo.text !== text.trim()) throw new Error('The returned task did not match this day. Refresh before retrying.');
  return todo;
}
export async function completeTodo(todo: TodoItem, completed: boolean): Promise<TodoItem> {
  const result = await saved(`/${encodeURIComponent(todo.id)}`, { date: todo.date, revision: todo.revision, completed }, 'PUT');
  if (result.id !== todo.id || result.date !== todo.date || result.completed !== completed) throw new Error('The returned task did not match this change. Refresh before retrying.');
  return result;
}
export async function deleteTodo(todo: TodoItem): Promise<void> {
  await request(`/${encodeURIComponent(todo.id)}`, { method: 'DELETE', body: JSON.stringify({ date: todo.date, revision: todo.revision }) });
}
