# Workload entry confirmation

The compact task button **Mark entered** sets one configured Status column on
the linked monday.com item. When entered, the same button becomes **Undo entry**
and sets the column back to **TBC**. It does not mark the task itself complete or copy
workload data to monday.com. The existing backend `MONDAY_TOKEN` is reused; users
do not sign in to monday.com.

## Confirmed mapping

The handler defaults to the supplied column on **GCMC & Media Demand Tracker**:

| Board ID | Column | Column ID | Confirmation label |
| --- | --- | --- | --- |
| `1967557512` | Report Assets | `color_mm72eqm4` | `Entered` |

`Entered` means asset input is done; `TBC` means it has not yet been entered.
`Media NA` is another existing label, not treated as entered. Only an explicit
button click writes `Entered` or resets it to `TBC`; status reads never change any label. The separate
Project Status column (`status__1`) is never written. The archived 2025 board has
no confirmed Report Assets column and is intentionally unmapped.

## Deployment

1. Keep the frontend flag off until the function is deployed and configured.
2. The mapping above is built in, so no new mapping secret is required. If
   `MONDAY_WORKLOAD_CONFIG` was previously set, update or remove it: it overrides
   the built-in mapping completely. An optional override uses this format:

   ```json
   {
     "1967557512": { "columnId": "color_mm72eqm4", "label": "Entered", "resetLabel": "TBC" }
   }
   ```

3. The existing `MONDAY_TOKEN` must have permission to edit these boards.
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided by Supabase Edge Functions.
   Set `MONDAY_ALLOW_ORIGIN` to the dashboard origin if configured for lookup.
4. Deploy `monday-workload` with the same gateway JWT verification as the
   dashboard's existing Supabase calls. Do not disable gateway verification.
5. Set `VITE_MONDAY_WORKLOAD=1` in the frontend build environment and rebuild.

For future boards, add each board's entry to this same mapping. `resetLabel` is
optional and defaults to `TBC`, so earlier configurations keep working. Use the
exact existing label on each board; new labels are never created. The entered
and reset labels must differ. Deploy the updated function and frontend to enable
undo; the previous function only accepts confirmation requests.

Missing token or an unmapped board returns `configured: false`.
The UI remains disabled with **Setup pending**. Never put `MONDAY_TOKEN` in a
`VITE_*` variable or browser storage. No database migration is required.

## Behaviour

- Available to dashboard editors for linked tasks; new tasks must first be saved
  and reopened. Drafts and unsaved edits cannot be confirmed.
- Reads the current monday status on opening, so confirmations survive reloads
  and reflect updates by other users. This status describes the monday column,
  not proof that later dashboard edits were synced. Editing does not clear it.
- Takes only the saved task ID and expected last-update timestamp from the client.
  Resolves the item from the saved task, verifies board membership, and writes only
  the backend-configured column/label. New labels are never created.
- Rechecks the task before either write, skips writes when already at the requested label, reads back
  after a write, and shows success only when the expected status is present.
- Timeout/failure leads to a read-only retry before another confirmation attempt.

## Existing dashboard access model

The current app login (`src/lib/auth.tsx`) is a browser editing gate, not a
server-verifiable user session. The database already grants its anon key access.
This function follows that existing internal/shared-access model: it forwards the
gateway credential to database reads, but cannot independently prove editor
identity. A gateway anon JWT and CORS are not per-user authorization. Anyone with
that app access can call this narrowly scoped confirmation endpoint once enabled.
Keep it disabled for a public/untrusted audience until server-enforced dashboard
authorization is available. This does not require individual monday.com logins.

## Validation

Run `node --test scripts/monday-workload.test.mjs` for mocked endpoint tests,
`node scripts/monday-workload-ui.test.mjs` for browser checks, and `npm run build`
for the frontend. No test contacts monday.com or changes live data.
After configuration, perform one deliberate confirmation on an agreed test item.

API: [Status values](https://developer.monday.com/api-reference/reference/status),
[versioning](https://developer.monday.com/api-reference/docs/api-versioning).
