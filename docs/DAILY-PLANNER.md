# Calendar and daily tasks

The homepage Calendar replaces the large Today clock. It follows the browser's
local date, refreshes each minute and refreshes immediately on focus/visibility.
Weeks start on Monday. Previous/next month controls browse dates; Today returns
to the current date. Lunar labels use the browser's built-in Chinese calendar,
including leap months. Browsers without support show Gregorian dates only; no
external calendar, weather or holiday service is called.

Selecting a date opens that day's private to-do list. Add a task, mark it complete
or incomplete, or delete it with confirmation. Completed and unfinished tasks
stay on their original date, so past days remain available through the calendar.
Dots mark dates with tasks; green marks a fully completed day. Refresh reloads the
day and month counts. Calendar dates still work while signed out.

While Today is selected, crossing midnight selects the new day automatically.
Browsing a historical date keeps that selection. Drafts are kept separately per
date while the planner remains mounted, and late requests always affect the date
they started on. Submit with Enter or the plus button to save a draft to the cloud.

Tasks are stored in the existing D1 database's `daily_todos` table with a day
index. It is initialized only through authenticated task routes; existing storage
cleanup and unrelated data are unaffected. There is no automatic history expiry.

- `GET /v1/todos?date=YYYY-MM-DD` reads one day.
- `GET /v1/todos?month=YYYY-MM` returns counts by date.
- `POST /v1/todos` accepts a stable UUIDv4, date and text.
- `PUT /v1/todos/:id` accepts date, revision and completion state.
- `DELETE /v1/todos/:id` accepts date and revision.

All endpoints use administrator Access JWT authentication; writes also require
an allowed Origin. Tasks are limited to 300 characters and 100 per day. Stable IDs
make creation retries safe. Revision checks reject stale edits/deletions and the
date cannot be changed through a completion request. Failed reads display an
error and reconnect/refresh actions rather than claiming the day is empty.

Checks cover leap years, month boundaries, lunar fallback, midnight selection,
per-date draft preservation, delayed reads, duplicate creation, daily capacity,
stale revisions, authentication, and real workerd/D1 persistence.
