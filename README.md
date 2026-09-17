# Side Eye

A social-deduction party game in the style of *Undercover* / *Spyfall*. Everyone
gets the same secret word — except the **Undercover** player, who gets a similar
one, and optionally **Mr. White**, who gets nothing at all. Give one-word clues,
argue, and vote out the impostors before they blend in.

Built with React 19, TypeScript, and Vite. Works fully offline out of the box and
can optionally connect to Supabase for online rooms, accounts, friends, and match
history.

## Game rules

- **Civilians** know the real secret word.
- **The Undercover** gets a closely related word and must go unnoticed.
- **Mr. White** (optional) gets no word at all and must bluff.

Each round players take turns giving a single-word clue, then discuss and vote.
The most-voted player is eliminated and their role revealed.

Win conditions:

- **Civilians** win by eliminating every Undercover and Mr. White.
- **Undercover** wins by surviving until only they and Mr. White remain.
- **Mr. White** wins by surviving to the end, or by guessing the secret word
  during the final guess phase.

## Features

- Pass-and-play on a single device, or online rooms with a room code.
- Host-configurable settings: number of Undercover players, Mr. White on/off,
  and clue / discussion / voting timers.
- Bot players to fill out a small lobby.
- Animated role reveals, pass-the-phone handoff screens, vote tallies, and a
  full cast reveal at the end.
- Guest play or Google sign-in (Supabase mode), plus friends and match history.
- Light/dark theme, responsive layout, and celebratory confetti.

## Getting started

```bash
npm install
npm run dev       # start the dev server
```

Open the printed local URL in a browser.

### Scripts

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `npm run dev`     | Start the Vite dev server with HMR.         |
| `npm run build`   | Type-check (`tsc -b`) and build for prod.   |
| `npm run preview` | Preview the production build locally.       |
| `npm run lint`    | Run Oxlint.                                 |

## Backend modes

The backend is chosen automatically at startup:

- **Local (offline)** — used when no Supabase credentials are present. Rooms,
  accounts, and history are simulated in the browser, so the whole game is
  playable on one device with no setup.
- **Supabase (online)** — enabled by providing credentials, unlocking real
  accounts, online rooms, friends, and persistent match history.

To enable online mode, copy `.env.example` to `.env` and fill in your project
values:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`.env` files are git-ignored; never commit real keys.

### Setting up a Supabase project

Online mode is **server-authoritative**: rooms, roles, votes, timers, bots, and
win conditions all live in Postgres and are driven through RPCs. Clients only
have read access to public tables, so secrets can't be inspected from the
browser. Two SQL files set everything up, in order:

1. Open your project's **SQL Editor** and run `supabase/migrations/0001_schema.sql`
   (tables, RLS, word list, realtime publication).
2. Run `supabase/migrations/0002_functions.sql` (game engine and RPCs).

Both files are idempotent, so re-running them is safe. (Alternatively, link the
Supabase CLI and run `supabase db push`.)

Then enable the auth providers you want under **Authentication → Providers**:

- **Anonymous** — required for "Continue as guest".
- **Google** — optional. Add the client ID/secret and register
  `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect
  URI in the Google Cloud console. Set **Authentication → URL Configuration →
  Site URL** to your deployed URL and add it (plus `http://localhost:5173` for
  local dev) to the redirect allow-list.

### Deploying to Vercel

1. Import the repository into Vercel.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
   (all environments).
3. Keep the default build command `npm run build` and output directory `dist`.

Without those variables the deployed site still works, falling back to the
offline single-device backend.

## Project structure

```
src/
  backend/      Local and Supabase backend implementations behind one interface
  components/   UI primitives and in-game components
    game/       Role reveal, clue input/stack, vote reveal, winner reveal, …
    ui/         Avatar, Modal, Toaster, Timer, Logo, Decor, …
  game/         Pure game logic, types, word lists, bot behavior
  hooks/        Theme and confetti hooks
  screens/      One component per app phase / route
  state/        App provider, context, and snapshot wiring
  styles/       Design tokens and global/component/screen styles
```

## License

Private project.
