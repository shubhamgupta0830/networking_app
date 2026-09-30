# WeMeThere (web)

Exchange LinkedIn profiles at events. Add the event you are at, scan the people
you meet, and every connection stays grouped under the event where you met them.

If the other person also uses WeMeThere, **one scan settles both sides** — their
profile lands in your list and yours lands in theirs, without them touching
their phone.

This is a web rebuild of the WeMeThere iOS app, with two things the iOS app does
not have: **accounts** and a **shared database**, so your connections follow you
to every device you sign in on instead of living on one phone.

---

## Features

| | |
|---|---|
| **Accounts** | Email + password, bcrypt-hashed, JWT sessions. |
| **Events** | Create an event without scanning anything. Rename, delete, and reorder by most recent activity. |
| **Connections** | Scan a LinkedIn QR code, confirm it, and it is filed under the event. Move between events or delete with a swipe. |
| **Your own QR code** | Set your LinkedIn URL once. Your code stays valid forever, even after you edit the URL. |
| **Mutual exchange** | Scanning another WeMeThere code records the connection for both people at once. |
| **Plain LinkedIn codes** | Someone without the app? Their normal LinkedIn QR code still works — you just confirm it first. |
| **PWA** | Installable to the home screen with its own icon and launch screens, and a cached shell for offline launch. |

### How the mutual exchange works

Your QR code encodes your real LinkedIn URL with one extra query parameter:

```
https://www.linkedin.com/in/you?wemethere=<public code>
```

Scanned by a generic QR reader or LinkedIn's own app, that is just your profile —
the unknown parameter is ignored. Scanned inside WeMeThere, the app reads the
code and performs the swap.

The public code is deliberately **not** your account id. It is published to
everyone who scans you, so it can identify you but cannot authorise anything.

---

## Running it locally

```bash
npm install
cp .env.example .env     # then fill in MONGODB_URI and JWT_SECRET
npm run dev              # http://localhost:3000
```

`MONGODB_URI` is any MongoDB connection string. If it has no database name in
the path, the app uses `wemethere`.

> **Camera note:** browsers only allow camera access over HTTPS (or on
> `localhost`). Anywhere else, the scanner falls back to typing the link by
> hand, which the sheet offers automatically.

---

## Deploying to Render (Blueprint)

1. Push this branch to GitHub.
2. In Render: **New → Blueprint**, pick this repository, and choose the
   `wemethere-web` branch. Render reads [`render.yaml`](render.yaml).
3. Render prompts for **`MONGODB_URI`** — paste your Atlas connection string.
   It is marked `sync: false` in the blueprint precisely so the secret is never
   committed to this repository. `JWT_SECRET` is generated for you.
4. In **MongoDB Atlas → Network Access**, allow `0.0.0.0/0`. Render's free tier
   has no fixed outbound IP, so without this the app cannot reach the database.
5. Click **Apply**. Render runs `npm ci` then `npm start`, and watches
   `/healthz`.

To deploy a different branch later, change `branch:` in `render.yaml`.

> Changing `JWT_SECRET` after the first deploy signs every user out, so leave it
> as-is.

---

## Project layout

```
server/
  index.js            express app, static hosting, SPA fallback
  config.js           env loading and startup validation
  db.js               mongo connection
  models/             User, Event, Connection
  routes/auth.js      signup, login, me, change password
  routes/api.js       events, connections, profile, QR, exchange
  lib/links.js        URL normalising and exchange-code encode/decode
  lib/store.js        event lookup, new-account seeding, state assembly
public/
  index.html          app shell
  app.js              controller — screens, sheets, data flow
  js/api.js           API client
  js/ui.js            sheets, alerts, toasts, swipe actions
  js/scanner.js       camera scanning with manual fallback
  styles.css          iOS-flavoured design system, light and dark
  icons/, splash/     generated PWA assets
scripts/
  generate_icons.py   regenerates every icon and launch image
  copy-vendor.js      copies the scanner bundle out of node_modules
```

Regenerate the app icons and launch images with `npm run icons`
(needs Python with Pillow).

---

## API

All routes are under `/api`; everything except `/auth/*` needs
`Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/signup` | Create an account, seeded with the default event |
| `POST` | `/auth/login` | Sign in |
| `GET` | `/auth/me` | Current account |
| `POST` | `/auth/change-password` | Change password |
| `GET` | `/state` | Every event with its connections, newest activity first |
| `POST` | `/events` | Create an event |
| `PATCH` | `/events/:id` | Rename |
| `DELETE` | `/events/:id` | Delete, with its connections |
| `PUT` | `/events/current` | Mark where incoming exchanges should land |
| `POST` | `/events/:id/connections` | Add a scanned profile |
| `PATCH` | `/connections/:id` | Move to another event |
| `DELETE` | `/connections/:id` | Delete |
| `PUT` | `/profile` | Set or edit your own LinkedIn URL |
| `GET` | `/profile/qr` | Your QR payload and its SVG |
| `POST` | `/exchange` | Perform a mutual swap |

---

## Security notes

- Passwords are bcrypt-hashed with a cost of 12 and never returned.
- Signup, login and password changes are rate limited per IP.
- Every event and connection route is scoped by `userId`, so one account cannot
  read or modify another's data.
- The QR code publishes `publicCode`, not the account id, so scanning someone
  never grants any write access to them.
- Login errors are identical for an unknown email and a wrong password, so the
  endpoint cannot be used to enumerate accounts.
