<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Never hang a command

**Never leave a shell command running without a bound.** A hung command blocks the user
and wastes their time. Treat every command as if it must return in seconds.

- **Always bound it.** Pass the tool timeout and, for anything that could stall, wrap it in
  `timeout <seconds> <command>`. If a command might not exit on its own, assume it won't.
- **Never run blocking processes in the foreground.** Dev servers, watchers, `nest start`,
  `vp dev`, `vp test watch`, Storybook, `docker compose logs -f`, etc. must be started
  detached — `setsid nohup <command> > /tmp/opencode/<name>.log 2>&1 < /dev/null &` — then
  verified with one short, bounded check (curl/`ss`), not by tailing or waiting.
- **Never `pkill -f <pattern>` or `pgrep -f <pattern>` when the pattern can match the
  invoking shell's own command line.** That kills the shell and the command hangs. Kill by
  PID or process group read from `ss -ltnp` / `ps`, by port (`fuser -k 3001/tcp`), or make
  the pattern not self-match (e.g. `[n]est start`).
- **Cap every wait.** No unbounded `sleep`, `wait`, retry loop, or log tail. Sleep only for
  a fixed, short interval and give up after a bounded number of checks.
- **Prefer the cheapest proof.** One quick query, `rg`, or HTTP request beats a full build,
  model load, or recursive run. Do not repeat heavy verification that already passed.
- **If something does hang, kill it before retrying** — a stuck process holding a port or
  lock is a common cause of every subsequent command hanging too.
