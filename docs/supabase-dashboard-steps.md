# Two Supabase Dashboard Settings — Step-by-Step

Both of these are quick, low-risk settings changes in the Supabase dashboard that
no available tool can reach for you. Total time: about 5 minutes.

Dashboard: [supabase.com/dashboard/project/moblcysnsaxohnslubym](https://supabase.com/dashboard/project/moblcysnsaxohnslubym)

---

## 1. Fix magic-link sign-in redirect (QUEUE-037)

**Why:** Magic-link sign-in emails currently redirect to `http://localhost:3000` and
fail with `ERR_CONNECTION_REFUSED` for any real user. The app code already sends the
correct production URL, but Supabase Auth ignores it unless that URL is on the
project's allow-list.

**Steps:**

1. Open **Authentication → URL Configuration** in the left sidebar.
2. Set **Site URL** to:
   ```
   https://lifeos-seven-rho.vercel.app
   ```
3. Under **Redirect URLs**, add:
   ```
   https://lifeos-seven-rho.vercel.app/**
   ```
   (The `/**` wildcard covers every callback path the app uses — magic link,
   password reset, invite accept, etc. — without needing one entry per route.)
4. If you want local development to keep working too, also add:
   ```
   http://localhost:3000/**
   ```
5. Click **Save**.

**Verify:** Try signing in with a magic link against the production site — it
should land you back on `lifeos-seven-rho.vercel.app`, not `localhost:3000`.

---

## 2. Enable leaked password protection (QUEUE-044)

**Why:** This checks new passwords against the HaveIBeenPwned breached-password
database at signup/reset time, rejecting passwords already known to be compromised.
It's currently off.

**Steps:**

1. Open **Authentication → Policies** (or **Authentication → Providers → Email**,
   depending on current dashboard layout — look for "Password Security").
2. Find **Leaked Password Protection** (sometimes labeled "Check against
   HaveIBeenPwned" or similar).
3. Toggle it **on**.
4. Save if there's an explicit save button (some toggles apply immediately).

**Verify:** Try signing up with a known-breached password (e.g. `password123`) —
it should now be rejected with a message about the password being compromised.

---

Both changes are pure Supabase Auth configuration — no app code, no deploy, no
database migration involved either way. Nothing to roll back beyond re-toggling if
you ever want to.
