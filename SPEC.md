# Money Tracker — Build Spec

Personal finance tracker for one user (Khalil). Installable PWA on phone + usable on laptop. Voice-first entry, full ledger, envelopes, loans, ventures, rich analytics. Must run at $0/month.

Owner / tech lead: Khalil. Every decision below is approved. Anything under "Defaults" can be changed by the owner — ask before deviating from this spec.

---

## 1. Approved decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Data model | From → To ledger. Every transaction moves money from one account to another. Friends, income sources and spending destinations are accounts too. |
| D2 | Budgeting | Envelopes. Every rupee of on-budget money is assigned to an envelope. |
| D3 | Offline | Online-first + offline entry queue (entries saved on device, synced when online). |
| D4 | Speech-to-text | Groq `whisper-large-v3`. Fallback: browser Web Speech API. |
| D5 | Parsing | Gemini Flash (free tier) with strict JSON. Fallback: Groq `openai/gpt-oss-120b`. Behind a swappable interface. |
| D6 | DB + auth | Supabase (Postgres + Auth + RLS). |
| D7 | Hosting | Vercel Hobby. |
| D8 | Charts | Apache ECharts (`echarts-for-react`), custom theme matching the design tokens. |
| D9 | UI | Next.js (App Router) + Tailwind + shadcn/ui + Framer Motion + 21st.dev components + custom pieces. |
| D10 | Business money | Each venture gets its own protected envelope. Business revenue lands there; business costs come from there; owner moves profit out with "Pay myself". |

Non-negotiable: Groq and Gemini API keys live only on the server (Vercel env vars, used in Next.js route handlers). Never in client code.

---

## 2. Core concepts

### 2.1 Accounts
Everything money can move between is an account. Kinds:

- `asset` — where money physically sits. Subtypes: `bank`, `wallet`, `cash`, `savings`. Has a real balance.
  - Flag `on_budget` (default true). Savings accounts like Mahana default to `false` (tracked, not part of envelopes).
- `person` — a friend/relative. Balance meaning: positive = they owe me, negative = I owe them.
- `source` — where income comes from: employers, clients, "Mahana Profit", "Opening Balance", "Gift received", etc.
- `sink` — where spent money goes. Default single sink `Spending`; optionally per-merchant sinks later.

Balance of any account = sum(incoming) − sum(outgoing). For persons this naturally gives the loan position.

### 2.2 Transaction types (derived from the from/to pair — never stored separately)

| From | To | Meaning | Example |
|------|----|---------|---------|
| source | asset | Income | Salary: Techroniqs → Meezan |
| asset | sink | Expense | Lunch: SadaPay → Spending (category Food/Eating out) |
| asset | asset | Transfer (not spending, not income) | Meezan → JazzCash |
| asset | person | I lent money / I repaid a debt | Meezan → Ali |
| person | asset | I borrowed / they repaid me | Ali → Meezan |
| person | sink | Friend paid for my expense (I now owe them) | Ali → Spending (Food) |
| person | sink + category "Loan written off" | Write-off | Ali → Spending |
| source | asset (savings) | Savings profit | Mahana Profit → Mahana |

Rules:
- Expenses (to = sink) require a category.
- Transfers and loan movements never appear in spending or income totals.
- A person → sink expense counts as my spending AND makes me owe that person.

### 2.3 Categories
Two levels (parent → child). Each category has `default_need_want` and `default_envelope_id`.

Seed (editable):
- Food → Daily meals, Snacks, Eating out, Groceries
- Transport → Fuel, Ride-hailing, Public transport, Vehicle maintenance
- Shopping → Clothes, Electronics, Home items, Other
- Bills → Mobile, Internet, Electricity, Gas, Rent
- Health → Medicine, Doctor
- Education → Courses, Books
- Personal care
- Entertainment
- Subscriptions → Software/AI tools, Streaming
- Family support
- Charity → Sadqa, Zakat
- Fees & charges → Bank/wallet fees
- Business → Ads, Tools, Hosting, Commissions, Freelance platform fees, Other
- Loan written off
- Reconciliation adjustment (system)

### 2.4 Per-transaction labels
- `for_whom`: self (default), gift, family, household, other
- `need_want`: need / want (default from category)
- `venture_id`: optional link to a venture
- `merchant`: free text (e.g. "Imtiaz")
- `note`

### 2.5 Ventures (businesses)
Fields: name, status (active/paused/closed), start date, notes. Each venture auto-creates a venture envelope.
Ventures can be added at any time from the Ventures screen (and during onboarding), plus edited, paused, closed or archived. A new venture can also be created on the fly from the voice confirmation screen when an unknown venture name is mentioned.

- Revenue: any income linked to a venture → goes into that venture's envelope.
- Costs: any expense linked to a venture → comes out of that venture's envelope.
- Investment: owner moves personal money into the venture envelope ("Invest in ElevLoop") → recorded as capital invested.
- Pay myself: owner moves money from venture envelope to personal "To Assign" → recorded as owner draw.

Venture detail view shows, for any period (this month / all time / custom):
- **Money I put in** — total invested (personal money moved in).
- **Money I took out** — total "Pay myself" draws, i.e. the income this venture has actually given me personally, with a monthly history.
- Revenue (all money earned by the venture), costs, profit (revenue − costs).
- Current envelope balance (business money still sitting in my accounts).
- Net personal position = money taken out − money put in (am I up or down on this venture overall).
- ROI = profit ÷ total invested × 100, monthly burn, months to payback.
- Full list of the venture's transactions and envelope moves.

### 2.6 Envelopes (D2 + D10)
Total money in on-budget asset accounts = sum of all envelope balances + "To Assign".

- Envelope kinds: `personal` (Food, Transport, Savings goal, …) and `venture` (one per venture).
- Each personal envelope has an optional monthly target.
- Income not linked to a venture lands in "To Assign". User assigns it to envelopes.
- "Copy last month's plan" assigns using the previous month's amounts in one tap.
- Expenses reduce their envelope (category's default envelope, overridable per transaction).
- Overspent envelope shows negative; user covers it by moving from another envelope.
- Unspent envelope money rolls over to next month (default).
- Moving money into an off-budget account (e.g. Meezan → Mahana) is an outflow from the chosen envelope (normally Savings goal).
- Lending to a person reduces the chosen envelope (default "To Assign"); repayment returns to "To Assign".

Envelope movements are stored in their own table (see schema) — they never touch real account balances.

### 2.7 Savings with variable daily profit (Mahana)
No API. Mahana account has an "Update balance" action:
1. User enters current balance (manually or by voice: "Mahana balance 200180").
2. App computes difference vs last known balance (after accounting for deposits/withdrawals since then).
3. Positive difference → auto-creates income: Mahana Profit → Mahana. Negative → flags for review.
4. Stores a snapshot; growth rate for the period = profit ÷ previous balance, annualized as well.

**Savings overview** (dedicated screen):
- Total savings = all `savings` accounts (Mahana, any others added later) + Savings goal envelope.
- Per savings account: current balance, money I deposited, money I withdrew, profit earned (this month / all time), latest and average growth rate, projection for the next 3/6/12 months at the average rate.
- Savings rate trend (share of income saved each month).
- Savings accounts can be added at any time from Accounts.

Same "Update balance" exists on every asset account for reconciliation; non-savings accounts create a "Reconciliation adjustment" transaction instead of profit.

### 2.8 Loans (persons)
- Add friend at any time from the People screen: name, optional phone, note. Can also be created on the fly from the voice confirmation screen. Edit and archive supported.
- Lend / borrow / repay (full or partial) / friend-paid-for-me / write-off — all via the from/to rules above.
- Every person-related transaction stores a `loan_action` (see schema) so the app knows which direction a repayment settles. Repayments settle the oldest open item first unless the user picks a specific one.
- Optional `due_date` on a lend or borrow; in-app reminder when due/overdue.
- Person screen shows BOTH directions separately, not just a net number:
  - **They owe me:** total lent − total they repaid, with each open item and its due date.
  - **I owe them:** total borrowed + amounts they paid for me − total I repaid, with each open item and its due date.
  - **Net:** the difference ("overall, Ali owes you Rs 1,500").
  - Full timeline of everything between us.
- People screen top summary: total owed to me (all friends), total I owe (all friends), net, number of overdue items.

---

## 3. Database schema (Supabase / Postgres)

All tables have `user_id uuid references auth.users` and RLS: `user_id = auth.uid()`. Amounts are `bigint` in whole rupees (PKR only for v1). Dates in `Asia/Karachi`.

```
accounts
  id uuid pk
  user_id
  name text
  kind text check (kind in ('asset','person','source','sink'))
  subtype text null            -- bank | wallet | cash | savings (assets only)
  on_budget boolean default true
  archived boolean default false
  meta jsonb default '{}'      -- phone for persons, etc.
  created_at timestamptz

categories
  id uuid pk, user_id
  parent_id uuid null references categories
  name text
  default_need_want text null check (in ('need','want'))
  default_envelope_id uuid null references envelopes
  is_system boolean default false

ventures
  id uuid pk, user_id
  name text
  status text check (in ('active','paused','closed'))
  started_on date
  envelope_id uuid references envelopes
  notes text

envelopes
  id uuid pk, user_id
  name text
  kind text check (in ('personal','venture','to_assign'))
  monthly_target bigint null
  sort_order int
  archived boolean default false

transactions
  id uuid pk, user_id
  occurred_on date
  amount bigint check (amount > 0)
  from_account_id uuid references accounts
  to_account_id uuid references accounts
  category_id uuid null references categories
  envelope_id uuid null references envelopes
  venture_id uuid null references ventures
  for_whom text default 'self'
  need_want text null
  merchant text null
  note text null
  due_date date null                    -- loans only
  loan_action text null check (loan_action in
    ('lend','borrow','repay_to_me','repay_by_me','friend_paid','write_off'))  -- required when a person account is involved
  settles_transaction_id uuid null references transactions  -- optional: which open loan item a repayment settles
  entry_method text check (in ('manual','voice','system'))
  entry_batch_id uuid null              -- groups transactions from one voice note
  auto_confirmed boolean default false  -- true when saved by auto-confirm (drives the "auto-added" badge)
  raw_transcript text null
  client_id uuid unique                 -- idempotency key for offline sync
  created_at timestamptz

envelope_moves
  id uuid pk, user_id
  occurred_on date
  amount bigint check (amount > 0)
  from_envelope_id uuid null            -- null = To Assign
  to_envelope_id uuid null              -- null = To Assign
  kind text check (in ('assign','move','investment','draw'))
  note text null

balance_snapshots
  id uuid pk, user_id
  account_id uuid references accounts
  taken_on date
  balance bigint
  adjustment_transaction_id uuid null references transactions
```

Database views / functions to provide:
- `account_balances` — current balance per account.
- `envelope_balances(month)` — assigned, spent, rolled-over, available per envelope.
- `to_assign_balance` — on-budget asset total minus all envelope balances.
- `person_balances` — per person, with outstanding due items.
- `venture_summary` — invested, revenue, costs, profit, draws, ROI.
- `period_summary(start, end)` — income, expense, net, excluding transfers and loan movements.

Validation (DB constraint or trigger): `to_account.kind = 'sink'` requires `category_id`; from and to must differ.

---

## 4. Voice entry flow

1. Home screen: large mic button. Tap to start, tap to stop (max 60s).
2. Record with `MediaRecorder`, mono, compressed.
3. POST audio to `/api/transcribe` → Groq `whisper-large-v3` → text. If Groq fails → retry once, then offer Web Speech API.
4. POST text to `/api/parse` with context:
   - today's date (Asia/Karachi)
   - user's account names (assets, persons, sources), categories, envelopes, ventures
   - few-shot examples in mixed Urdu/English
5. Model returns JSON array of draft transactions (one voice note can contain several):
   ```json
   [{
     "action": "expense | income | transfer | lend | borrow | repay_to_me | repay_by_me | friend_paid | write_off | savings_update | envelope_move",
     "amount": 3500,
     "date": "2026-11-01",
     "from": "SadaPay",
     "to": "Spending",
     "category": "Food > Groceries",
     "merchant": "Imtiaz",
     "venture": null,
     "for_whom": "self",
     "need_want": "need",
     "due_date": null,
     "note": "",
     "confidence": 0.92,
     "unknown_names": []
   }]
   ```
6. Server validates against the schema (zod). Unknown person/merchant names come back in `unknown_names` → confirmation screen offers "Add Ali as new person?".
7. What happens next depends on the **Auto-confirm** setting (toggle in Settings, plus a quick toggle next to the mic button; default OFF):

   **Auto-confirm OFF (review mode)**
   - Each draft is stored locally (IndexedDB) first — nothing goes to the database yet. Drafts survive closing the app.
   - User sees one card per draft showing the parsed entry, with two buttons: **Edit** and **Add**.
   - Edit → the card becomes an editable form (every field); user saves the edit and it returns to the card with Add.
   - Add → user confirms → the entry is sent to the database and removed from local drafts.
   - Discard option on each card. "Add all" when there are several drafts.
   - Low-confidence fields are highlighted on the card.

   **Auto-confirm ON (instant mode)**
   - Drafts are saved straight to the database (or to the offline queue if there is no connection) with no review step.
   - A short toast shows what was added, with **Undo** (a few seconds).
   - Auto-added entries carry an "auto-added" badge and can be filtered in Transactions, then edited or deleted any time.
   - Safety exception: a draft that cannot be saved correctly — missing amount, or a name that doesn't match any existing account, person or venture — is not guessed. It falls back to the review card so the user can fix it or create the new person/venture. All other drafts from the same voice note are still auto-added.

8. In review mode, nothing reaches the database until the user taps Add.

Provider interface (swap providers without touching UI):
```
transcribe(audio): Promise<string>
parseTransactions(text, context): Promise<Draft[]>
```
Gemini primary, Groq fallback on error or rate limit.

Offline: if no connection, the audio blob is stored in the offline queue and processed automatically when back online (user gets a notification to confirm).

---

## 5. Offline entry queue (D3)

- IndexedDB (via Dexie) holds pending manual entries, pending voice recordings, and unconfirmed voice drafts (review mode). Drafts are never synced until the user taps Add.
- Every entry gets a `client_id` UUID on creation; server insert is idempotent on `client_id`.
- Pending items show a small "waiting to sync" badge.
- Sync on `online` event and on app open.
- Reading data (charts, history) requires internet in v1; show last cached screen if offline.

---

## 6. Analytics

All analytics exclude transfers and loan movements unless stated. Every view has a period switcher: Today / This week / This month / Custom, and compares with the previous equal period.

1. **Period summary** — money in, money out, net, % change vs previous period, daily average spend.
2. **Cash flow trend** — income vs expense line over time (daily within month, monthly over a year).
3. **Where it goes** — spending by category and subcategory (donut + drill-down), by `for_whom`, need vs want split.
4. **Money flow diagram** (ECharts Sankey) — income sources → accounts → categories / ventures / savings for the selected period.
5. **Spending calendar** (ECharts calendar heatmap) — each day colored by spend.
6. **Spending treemap** — categories sized by amount.
7. **Leak detection**
   - Categories above their 3-month average (amount and %).
   - Small repeated spends: merchants/subcategories with many small transactions, summed for the month.
   - Wants as % of total spending, trend over months.
8. **Envelope health** — per envelope: assigned, spent, available, projected month-end at current pace, overspent warnings. Gauges for progress.
9. **Savings**
   - Savings rate = (income − expense) ÷ income.
   - Mahana: balance trend, profit per update, average daily rate, annualized rate, projection.
10. **Net worth** — all asset balances + amounts owed to me − amounts I owe, over time.
11. **Income** — by source per month; salary vs irregular share.
12. **Ventures** — per venture: invested, revenue, costs, profit, draws, ROI, monthly burn, payback months; comparison across ventures.
13. **Loans** — total owed to me, total I owe, overdue list, per-person balances.
14. **Accounts** — current balance per account and trend.

---

## 7. Screens (described, no layouts prescribed)

1. **Onboarding / Setup** (first run, also reachable from Settings)
   - Add asset accounts with opening balances (creates income from "Opening Balance" source; these never count in income analytics).
   - Add income sources.
   - Define ventures (each creates its envelope).
   - Add people (optional; can be added later or from voice).
   - Review seed categories and envelopes.
2. **Home** — period summary, To Assign banner if > 0, envelope warnings, overdue loans, big mic button, quick manual add.
3. **Confirm entries** — draft cards with Edit / Add from voice parsing in review mode; also lists any pending local drafts (section 4, step 7).
4. **Manual add** — fast form: amount, from, to, category (recent-first), optional labels. Smart defaults from last similar entry.
5. **Transactions** — list with search and filters (account, category, venture, person, for_whom, need/want, date range). Edit and delete.
6. **Envelopes** — month view: To Assign, every envelope's assigned/spent/available; assign, move, copy last month's plan; venture envelopes with Invest / Pay myself.
7. **Accounts** — balances, per-account history, Update balance (reconcile / Mahana profit).
8. **People** — "Add friend" button; top summary (total owed to me, total I owe, net, overdue count); list of friends each showing they-owe-me / I-owe-them / net; person detail as in section 2.8.
9. **Ventures** — "Add venture" button; list with money put in, money taken out, profit and ROI per venture; venture detail as in section 2.5.
10. **Savings** — savings overview as in section 2.7, with Update balance shortcut for Mahana.
11. **Analytics** — all section 6 views.
12. **Settings** — Auto-confirm toggle; light/dark mode; manage accounts, categories, envelopes, ventures, sources, people; CSV export; sign out.

---

## 8. Design direction

### 8.1 Color — flat, one primary, no gradients
- **No gradients anywhere**: backgrounds, buttons, cards, charts, icons, loaders. Solid fills only.
- **Primary color: Blue `#2563EB`** (dark mode: `#3B82F6`). Used for primary buttons, the mic button, active tab/nav item, links, focus rings, selected states and the main chart series.
- Why blue: green and red are reserved for money meaning (income/expense), so the primary must not be either; blue stays neutral and readable in light and dark mode.
- Semantic colors, used ONLY for meaning, never decoration: income/positive `#16A34A`, expense/negative `#DC2626`, warning (overspent, overdue) `#D97706`.
- Everything else is neutral grays (Tailwind `zinc` scale) for backgrounds, borders and text.
- ECharts theme: primary blue first, then a small set of flat muted tones for categories; no gradient fills, no shadows on series.
- All colors are design tokens (CSS variables); changing the primary later is a one-line change.

### 8.2 Layout — native feel on each device
Breakpoint: below 768px = mobile layout; 768px and up = desktop layout. Same pages and data, different shells.

**Mobile (phone, installed PWA)**
- Bottom tab bar with 5 items: Home, Transactions, Mic (center, larger, primary blue), Envelopes, More.
- "More" opens a sheet with: Accounts, People, Ventures, Savings, Analytics, Settings.
- Forms, filters, edit screens and pickers open as bottom sheets (slide up), not centered dialogs.
- Swipe actions on list items (e.g. swipe a transaction to edit/delete), pull to refresh.
- Large touch targets (min 44px), thumb-reachable primary actions near the bottom, safe-area padding for notches and gesture bars.
- Single-column content; charts sized for the screen width with horizontal scroll where needed.

**Desktop (laptop browser)**
- Left sidebar navigation with all sections (Home, Transactions, Envelopes, Accounts, People, Ventures, Savings, Analytics, Settings); collapsible.
- Top bar with period switcher, search, and a mic button.
- Multi-column dashboards (e.g. summary cards in a row, charts side by side).
- Forms and edits open as centered dialogs or a right-side panel.
- Tables with sortable columns for transactions; hover states and keyboard shortcuts (e.g. `N` new entry, `M` start mic, `/` search).

### 8.3 Components and motion
- One design token set (colors, radius, spacing, fonts) defined first in Tailwind config / CSS variables. Every shadcn and 21st.dev component is restyled to these tokens so nothing looks stitched together.
- Rich, not plain — through motion and layout, not decoration: smooth Framer Motion transitions, animated number counters, card entrance animations, satisfying mic interaction (pulse while recording, flat colors only).
- Must feel like a native app when installed (no browser chrome).
- PKR formatting with thousands separators (Rs 1,25,000 lakh-style grouping — see Defaults).

---

## 9. Build phases

Each phase ends deployed to Vercel and usable on the phone.

**Phase 0 — Foundation**
Next.js (App Router, TypeScript), Tailwind, shadcn/ui, Framer Motion, design tokens, Supabase project + Auth (email magic link), RLS, PWA manifest + service worker (installable), Vercel deploy, daily Vercel Cron that pings Supabase to prevent free-tier pausing.
Also: both layout shells from section 8.2 (mobile bottom tab bar, desktop sidebar) and the flat color tokens from 8.1.
Done when: app installs on phone, login works, empty home screen loads with the bottom tab bar on phone and the sidebar on desktop.

**Phase 1 — Ledger core**
Schema for accounts, categories, transactions; seed categories; onboarding for asset accounts + opening balances + income sources; manual add; transactions list with filters; account balances.
Done when: income, expense and transfer entries produce correct balances and transfers don't count as spending.

**Phase 2 — People and ventures**
Person accounts and all loan actions, due dates, person screen; ventures setup and linking transactions to ventures.
Done when: lend → partial repay → friend-paid-for-me → write-off all give correct person balances.

**Phase 3 — Envelopes**
Envelopes, envelope moves, To Assign, monthly targets, copy last month's plan, rollover, overspend cover; venture envelopes with Invest and Pay myself; off-budget savings handling.
Done when: on-budget total always equals envelope balances + To Assign.

**Phase 4 — Voice entry**
Recording, `/api/transcribe` (Groq), `/api/parse` (Gemini → Groq fallback), zod validation, local drafts, review mode (Edit / Add cards), auto-confirm mode (instant save + Undo toast + "auto-added" badge + unknown-name fallback to review), unknown-name handling, Web Speech fallback.
Done when: mixed Urdu/English notes like "aaj Imtiaz se 3500 ka grocery SadaPay se, aur Ali ko 2000 udhaar diye cash" produce two correct drafts.

**Phase 5 — Analytics**
All section 6 views with ECharts and custom theme.

**Phase 6 — Offline queue and reconciliation**
Dexie queue for manual + voice entries with idempotent sync; Update balance on all asset accounts; Mahana profit flow and growth analytics.

**Phase 7 — Polish**
In-app reminders for due loans and overspent envelopes, CSV export, recurring transactions (rent, subscriptions), performance pass.

---

## 10. Defaults (owner may override)

- AI calls go through Next.js route handlers on Vercel (keys in Vercel env vars).
- Offline storage: Dexie (IndexedDB).
- Validation: zod, shared between client and server.
- Data fetching: TanStack Query.
- Number format: Pakistani grouping (1,25,000). Currency PKR only.
- Timezone: Asia/Karachi everywhere.
- Auth: Supabase email magic link (single user).
- Theme: dark mode default, light mode available.
- Raw audio is not stored after transcription; transcript is stored on the transaction.

## 11. Example seed data (edit during onboarding)

- Assets: Meezan (bank, on-budget), SadaPay (wallet), Easypaisa (wallet), JazzCash (wallet), Cash (cash), Mahana (savings, off-budget)
- Sources: Techroniqs salary, SnapDev AI, Mahana Profit, Opening Balance, Gift received
- Ventures: ElevLoop, Make Pakistan Digital, Electronics store
- Envelopes: Food, Transport, Bills, Shopping, Health, Personal, Family, Charity, Savings goal, Fun + one per venture
