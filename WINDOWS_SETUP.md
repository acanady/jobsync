# Running this JobSync fork on Windows

This fork ([acanady/jobsync](https://github.com/acanady/jobsync)) adds features that
are not in upstream JobSync:

- automation filters: **exclude titles** (e.g. Senior, Staff) and **remote (US) only**
- **bulk dismiss / delete** on the Jobs list
- assistant tools to **tailor a resume to a job** and **edit a resume by chat**,
  with a before/after card you approve, plus a "tailor it?" offer after each AI match

Those features live on the **`acanady-dev`** branch, which is the fork's default
branch (the fork's `main` is an unchanged copy of upstream). There is **no
prebuilt Docker image** for the fork: `docker compose` builds it from the code on
your machine the first time (about 5 minutes). Node.js is **not** needed to run
it; Docker does the build.

---

## 1. Install the prerequisites

1. **Enable virtualization / WSL 2.** In an *administrator* PowerShell:

   ```powershell
   wsl --install
   ```

   Restart when asked. (If it says WSL is already installed, run `wsl --update`.)

2. **Install Docker Desktop** from <https://www.docker.com/products/docker-desktop/>.
   During setup keep **"Use WSL 2 instead of Hyper-V"** checked. Start Docker
   Desktop and wait until it says *Engine running*.

3. **Install Git for Windows** from <https://git-scm.com/download/win> (defaults are fine).

4. Check both, in a normal PowerShell window:

   ```powershell
   docker version
   docker compose version
   git --version
   ```

> **Low on RAM?** The build needs roughly 4 GB available to Docker. If it fails
> with an out-of-memory or "killed" error, give WSL more memory by creating
> `%UserProfile%\.wslconfig` with:
>
> ```ini
> [wsl2]
> memory=6GB
> ```
>
> then run `wsl --shutdown` and restart Docker Desktop.

---

## 2. Get the code

```powershell
cd $HOME
git clone https://github.com/acanady/jobsync.git
cd jobsync
git branch --show-current
```

The last command should print `acanady-dev`. (The repository's `.gitattributes`
keeps the container's shell scripts in Linux line endings on Windows, so no
special Git settings are needed.)

---

## 3. Configure secrets and your timezone

Generate two random secrets (run the line twice and keep both outputs):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Create a file named `.env` in the `jobsync` folder (for example with
`notepad .env`) containing:

```ini
AUTH_SECRET=<first value>
ENCRYPTION_KEY=<second value>
TZ=America/Chicago
NEXTAUTH_URL=http://localhost:3737
```

- **AUTH_SECRET** signs your login sessions. If it is missing, `docker-compose.yml`
  falls back to the public placeholder `your-auth-secret`, which anyone could use
  to forge a session.
- **ENCRYPTION_KEY** encrypts the AI API keys you save in Settings. If it is
  missing, the public placeholder `you-encryption-key-here` is used. Set it before
  adding any keys and **never change it** afterwards — a new value makes saved keys
  unreadable (you would re-enter them in Settings).
- **TZ** is your timezone ([list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)).
  Automation schedule hours are in this timezone.
- **NEXTAUTH_URL**: keep `localhost` unless you open JobSync from another device,
  in which case use `http://<this-pc's-ip>:3737`.

---

## 4. Build and start

The repository includes `docker-compose.override.yml`, which Docker Compose
merges in automatically: it builds JobSync from this code instead of pulling
upstream's prebuilt image (which lacks this fork's features).

```powershell
docker compose up -d --build
```

The first build takes a few minutes. When it finishes, check it is healthy:

```powershell
docker compose ps
docker compose logs --tail 20
```

You should see `Ready in …ms` and `[Scheduler] Started successfully`. Open
<http://localhost:3737> and create your account. Add your AI provider and API
key in **Settings**.

Your data is stored in `jobsync\jobsyncdb\data\` (a SQLite database). Back that
folder up to keep your jobs and resumes.

---

## 5. Everyday use

| Task | Command (from the `jobsync` folder) |
|---|---|
| Stop | `docker compose stop` |
| Start again | `docker compose start` |
| View logs | `docker compose logs -f` |
| Update to the latest fork code | `git pull` then `docker compose up -d --build` |

Use these instead of `deploy.ps1` / `deploy.sh`: those scripts default to the
`main` branch and upstream's prebuilt image.

---

## 6. Optional: Node.js, for changing the code or running the tests

You only need this to develop, not to run JobSync.

1. Install **Node.js 22 LTS** from <https://nodejs.org> (some dependencies
   require Node 22 or newer).
2. In the `jobsync` folder:

   ```powershell
   npm ci
   npx prisma generate
   npm test
   ```

   `npm test` runs the full test suite (a few minutes).
3. To run the app without Docker for development, add
   `DATABASE_URL=file:./dev.db` to `.env`, then:

   ```powershell
   npx prisma migrate deploy
   npm run dev
   ```

   and open <http://localhost:3737>.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `exec /app/docker-entrypoint.sh: no such file or directory` | The script has Windows line endings, usually from a copy made outside Git. Run `git checkout -- docker-entrypoint.sh`, then `docker compose up -d --build`. |
| Saved API keys stop working | `ENCRYPTION_KEY` changed or missing. Restore the original value. |
| Build killed / out of memory | Raise WSL memory (step 1 note). |
| New fork features missing | You are running upstream's image — check `docker-compose.override.yml` exists and that `git branch --show-current` prints `acanady-dev`, then `docker compose up -d --build`. |
| Automations run at the wrong hour | Set `TZ` in `.env`, then `docker compose up -d`. |
| Can't reach Ollama on this PC | Keep `OLLAMA_BASE_URL=http://host.docker.internal:11434` (the default). |
