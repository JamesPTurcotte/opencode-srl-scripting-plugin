# OpenCode SRL Scripting Plugin

An [OpenCode](https://opencode.ai) plugin that turns the AI into an expert **OSRS Simba script writer** using the Torwent ecosystem.

## Ecosystem

| Library | Purpose | URL |
|---------|---------|-----|
| **Simba 1400** | Lape/Pascal IDE with client reflection hooks | [Villavu/Simba](https://github.com/Villavu/Simba) |
| **SRL-T** | Core reflection API (Bank, Inventory, Combat, Walker, Antiban, etc.) | [Torwent/SRL-T](https://github.com/Torwent/SRL-T) |
| **WaspLib** | Extended API with tile-accurate objects, custom maps, handlers | [Torwent/WaspLib](https://github.com/Torwent/WaspLib) |

## Agents

| Agent | Mode | Purpose |
|-------|------|---------|
| **S-Plan** | **Primary** | Single orchestrator. Guides script creation idea → review. |
| S-Arch | Subagent | State machines, task flow, fail-safe design |
| S-Tech | Subagent | API selection (SRL-T vs WaspLib tradeoffs) |
| S-Impl | Subagent | Writes production Simba/Pascal code |
| S-Refactor | Subagent | Code improvement without behavior change |
| S-Review | Subagent | Multi-pass audit orchestrator |
| S-Correctness | Subagent | Logic validation, edge cases |
| S-Sentry | Subagent | Anti-ban/anti-detection audit |
| S-Perf | Subagent | Performance optimization |
| S-Skeptic | Subagent | Devil's advocate, stress testing |

## Tools

| Tool | What it does |
|------|-------------|
| `check-script-readiness` | Scans `.simba` files for TODOs, missing anti-ban, hardcoded waits, physical mouse usage |
| `check-srl-api` | Fetches live docs from `torwent.github.io/SRL-T` |
| `check-wasplib-api` | Fetches live docs from `torwent.github.io/WaspLib` |
| `fetch-osrs-wiki` | Looks up item IDs, monster stats, quest requirements |
| `create-script-skeleton` | Generates a complete script skeleton with state machine + anti-ban |

## Engineering Principles

- **State machines over linear scripts** — every script can recover from failure
- **Anti-ban is architecture, not an afterthought** — designed in from the first state
- **Simulated mouse only** — all input through SMART, never physical mouse APIs
- **Live API verification** — tools fetch current docs to prevent hallucinated signatures
- **Overshoot + misclick simulation** — 2-5% misclick rate, overshoot corrections on every click
- **Reaction delay variance** — 80-350ms, never the same window twice
- **Fail-safes are first-class states** — lost position, no supplies, death are all handled
- **WaspLib-first** — prefer battle-tested handlers over custom code

## Installation

1. Copy the `plugins/srl.mjs` and `prompts/` directory into your OpenCode config directory (`~/.config/opencode/`)
2. Add `"./plugins/srl.mjs"` to the `plugin` array in your `opencode.jsonc`
3. Add the `S-*` agent definitions from `opencode.jsonc` into your `agent` object
4. Optionally copy `AGENTS-SRL.md` to `~/.config/opencode/` for always-on instructions

## Usage

Simply invoke `S-Plan` in any conversation. If no script context exists, S-Plan will refresh its API knowledge and ask what you want to build. From there it orchestrates the full pipeline: requirements → architecture → implementation → review.
