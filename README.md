# Life Settings · 人生设置

An English–Chinese classroom experience about gender stereotypes, individual choices and opportunities. One presenter controls the room while classmates participate through their mobile browsers.

一场由主持人控制、同学使用手机浏览器参与的课堂互动，围绕性别刻板印象与个人选择展开。

## Features

- Name/nickname entry and gender-based simulated defaults.
- Four settings unlocked by the presenter: interests, future, emotions and responsibilities.
- Automatically saved choices and live revision statistics.
- A role-ranking activity with identical profiles and randomly assigned gender labels.
- Predictions of the classroom revision rate, with a snapshot frozen at reveal.
- Three equally likely winning participant numbers, sampled without replacement.
- Local PNG keepsakes with bilingual quotes or custom text.
- Separate presenter, audience and projection views.

The presets are simulated stereotypes, not claims about actual gender differences. Classroom results are descriptive and do not establish causation. Keeping a default is also a valid personal choice.

## Run locally

Use Node.js 24 or newer. The application uses built-in Node modules, including SQLite; no third-party npm dependencies are required.

```bash
npm start
```

Open these URLs on the same machine:

- Presenter: `http://127.0.0.1:8787/life.html?mode=host`
- Audience: `http://127.0.0.1:8787/life.html`
- Health: `http://127.0.0.1:8787/api/health`

Create a room from the presenter view and use **Open projection** to display its QR code. The host key stays in the browser; download a backup and keep it private.

The default server binds to `127.0.0.1` for use behind a reverse proxy. `HOST` and `PORT` can override this. A phone cannot access another computer using `127.0.0.1`; the shared invite must use the publicly reachable host.

## Self-host on Linux

The existing deployment uses `/www/wwwroot/life-settings`, a `www` service account, and the unit in `deploy/life-settings.service`. If installing elsewhere, adjust the working directory, account and Node executable path in the service unit.

Put Nginx or another reverse proxy in front of `http://127.0.0.1:8787`. Configure a domain and HTTPS, and disable proxy caching for API responses. DNS and TLS are configured on the hosting server, separately from GitHub.

`UPDATE.sh` is an upgrade helper for the existing BaoTa deployment. It expects an existing application at `/www/wwwroot/life-settings`, runs from a separate staging directory, backs up the current app and database, and restores them if its health check fails. It is not a first-time installer. See `README.txt` for the original update and presenter instructions.

## Data and privacy

- The runtime creates `data/life-settings.sqlite`; this directory is excluded from version control.
- Participant names, gender presets and choices are stored in the room database. Public results are aggregates; the lottery exposes winning numbers only.
- Rooms expire after seven days. Expiry blocks access but does not automatically erase stored rows.
- Keep databases, host-key exports, result exports, server backups and credentials out of the repository.
- Custom keepsake text is processed locally on the device. Mobile browsers decide whether saving uses a download, share menu or long press.

## Project layout

| Path | Purpose |
| --- | --- |
| `public/` | Browser UI, QR generator and PNG rendering |
| `shared/core.mjs` | Room API, authorization, choices, activities and lottery |
| `local/server.mjs` | HTTP server and SQLite schema migration |
| `deploy/life-settings.service` | Example systemd service |
| `UPDATE.sh`, `ROLLBACK.sh` | Existing Linux deployment upgrade tools |

## Checks

```bash
npm run check
```

Then use a test room to verify joining, locked choices, autosave, host controls, reveal behavior, PNG generation and the lottery on both a computer and a phone. Create a separate room for the real presentation.

## Hosting note

This is a Node.js application with a persistent database. GitHub stores the source; GitHub Pages alone cannot run its interactive backend. The existing cloud server continues to host the live site.

The QR generator's third-party license is retained in `public/QR-LICENSE.txt`.
