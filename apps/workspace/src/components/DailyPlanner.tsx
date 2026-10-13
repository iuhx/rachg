import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TodoDaySummary } from '@rachg/shared';
import { fetchTodoMonth } from '../services/todoService';
import { calendarDate, localDay, lunarDate, monthDays, shiftMonth } from '../utils/calendar';
import { DailyTodos, type TodoDraft } from './DailyTodos';

interface Props { now: Date | null; canManage: boolean }
export function DailyPlanner({ now, canManage }: Props) {
  const today = now ? localDay(now) : '';
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [days, setDays] = useState<TodoDaySummary[]>([]);
  const [countsLoading, setCountsLoading] = useState(false);
  const [countsError, setCountsError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, TodoDraft>>({});
  const selected = chosenDate || today;
  const month = chosenMonth || selected.slice(0, 7);
  const fullDateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeZone: 'UTC' }), []);
  const cells = useMemo(() => month ? monthDays(month).map(day => ({ day, label: fullDateFormatter.format(calendarDate(day)), lunar: lunarDate(day), compactLunar: lunarDate(day, true) })) : [], [month, fullDateFormatter]);
  useEffect(() => {
    let cancelled = false;
    setDays([]); setCountsError(false);
    if (!month || !canManage) { setCountsLoading(false); return; }
    setCountsLoading(true);
    fetchTodoMonth(month).then(result => { if (!cancelled) setDays(result); })
      .catch(() => { if (!cancelled) setCountsError(true); })
      .finally(() => { if (!cancelled) setCountsLoading(false); });
    return () => { cancelled = true; };
  }, [month, canManage, refresh, today]);
  const selectDate = (day: string) => { setChosenDate(day === today ? null : day); setChosenMonth(day === today ? null : day.slice(0, 7)); };
  const returnToday = () => { setChosenDate(null); setChosenMonth(null); };
  if (!now) return <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]"><section className="workspace-card overview-calendar p-6 min-h-96"><h2 className="type-modal-heading">Calendar</h2><p className="type-secondary mt-4 text-white/60">Loading your calendar…</p></section><section className="workspace-card p-6"><h2 className="type-modal-heading">Daily to-do</h2></section></div>;
  const fullDate = (day: string) => fullDateFormatter.format(calendarDate(day));

  return <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
    <section className="workspace-card overview-calendar p-5 sm:p-6 min-w-0" aria-labelledby="calendar-heading">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 id="calendar-heading" className="type-label uppercase tracking-[0.15em] text-white/60">Calendar</h2><button type="button" onClick={returnToday} className="rounded-lg border border-white/20 px-2.5 py-1 text-xs text-white/80 hover:bg-white/10">Today</button></div>
      <div className="flex items-center justify-between gap-2 mb-5">
        <h3 className="font-serif text-2xl tracking-tight">{new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(calendarDate(`${month}-01`))}</h3>
        <div className="flex gap-1"><button type="button" aria-label="Previous month" onClick={() => setChosenMonth(shiftMonth(month, -1))} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button><button type="button" aria-label="Next month" onClick={() => setChosenMonth(shiftMonth(month, 1))} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button></div>
      </div>
      <div className="grid grid-cols-7 text-center mb-1" aria-hidden="true">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span key={day} className="text-[10px] py-1 text-white/45">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1" aria-label="Calendar dates">{cells.map(({ day, label, lunar, compactLunar }) => {
        const summary = days.find(item => item.date === day);
        const isSelected = day === selected, isToday = day === today;
        return <button key={day} type="button" data-calendar-day={day} aria-label={`${label}${lunar ? ` · ${lunar}` : ''}${summary ? ` · ${summary.total} tasks` : ''}`} aria-pressed={isSelected} aria-current={isToday ? 'date' : undefined} onClick={() => selectDate(day)} className={`min-w-0 min-h-12 rounded-xl py-1 flex flex-col items-center justify-center transition-colors ${isSelected ? 'bg-white text-neutral-900' : day.startsWith(month) ? 'text-white/85 hover:bg-white/10' : 'text-white/30 hover:bg-white/5'}`}>
          <span className={`text-sm tabular-nums leading-5 ${isToday && !isSelected ? 'underline underline-offset-4 decoration-white/60 font-semibold' : ''}`}>{Number(day.slice(-2))}</span>
          <span className={`text-[9px] leading-4 truncate max-w-full px-0.5 ${isSelected ? 'text-neutral-500' : 'opacity-60'}`}>{compactLunar || '\u00a0'}</span>
          <span className={`h-1 w-1 rounded-full ${summary ? summary.completed === summary.total ? 'bg-emerald-400' : isSelected ? 'bg-neutral-600' : 'bg-white/60' : 'bg-transparent'}`} />
        </button>;
      })}</div>
      <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap justify-between gap-2 text-[11px] text-white/55">
        <span>{lunarDate(selected) || fullDate(selected)}</span>
        {countsError ? <button type="button" onClick={() => setRefresh(value => value + 1)} className="underline">Retry task markers</button> : <span>{countsLoading ? 'Loading task markers…' : '• Dates with tasks'}</span>}
      </div>
    </section>
    <DailyTodos key={selected} date={selected} today={today} canManage={canManage} draft={drafts[selected]}
      onDraftChange={text => setDrafts(current => ({ ...current, [selected]: { id: crypto.randomUUID(), text } }))}
      onCreated={id => setDrafts(current => { if (current[selected]?.id !== id) return current; const next = { ...current }; delete next[selected]; return next; })}
      onChanged={() => setRefresh(value => value + 1)} />
  </div>;
}
