import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tool } from "@opencode-ai/plugin";

const pluginPath = fileURLToPath(import.meta.url);
const pluginDir = path.dirname(pluginPath);

function findRoot(dir) {
  let current = dir;
  while (current !== path.resolve(current, "..")) {
    if (fs.existsSync(path.join(current, "AGENTS.md"))) return current;
    current = path.resolve(current, "..");
  }
  return dir;
}

const rootDir = findRoot(pluginDir);

function getSRLInstructions() {
  try {
    const p = path.join(rootDir, "AGENTS-SRL.md");
    return fs.readFileSync(p, "utf8").trim();
  } catch (e) {
    return "";
  }
}

function checkScriptReadiness(files, cwd) {
  const issues = [];
  for (const f of files) {
    const fullPath = path.resolve(cwd, f);
    if (!fs.existsSync(fullPath)) {
      issues.push({ file: f, issue: "File not found" });
      continue;
    }
    const content = fs.readFileSync(fullPath, "utf8");
    if (!f.endsWith(".simba")) {
      issues.push({ file: f, issue: "Not a .simba file" });
      continue;
    }
    if (content.includes("TODO") || content.includes("FIXME") || content.includes("HACK")) {
      issues.push({ file: f, issue: "Contains TODO/FIXME/HACK" });
    }
    if (content.length < 50) {
      issues.push({ file: f, issue: "File appears empty or stub" });
    }
    if (!content.includes("RandomRange") && !content.includes("Random(")) {
      issues.push({ file: f, issue: "No randomized sleeps found — likely uses hardcoded waits" });
    }
    if (!content.includes("Antiban")) {
      issues.push({ file: f, issue: "No anti-ban calls detected" });
    }
    if (!content.includes("{$I")) {
      issues.push({ file: f, issue: "No includes found — missing SRL-T/WaspLib imports" });
    }
    const hasMainLoop = content.match(/\b(repeat|while)\b/i);
    const hasEscape = content.match(/\b(until|break|exit|halt)\b/i);
    if (hasMainLoop && !hasEscape) {
      issues.push({ file: f, issue: "Main loop may have no escape condition" });
    }
  }
  return issues;
}

function findSimbaInstall() {
  const candidates = [];
  // Common Simba install paths
  if (process.platform === "win32") {
    candidates.push("C:\\Simba\\");
    candidates.push("C:\\Program Files\\Simba\\");
    candidates.push(process.env.LOCALAPPDATA + "\\Simba\\");
  } else if (process.platform === "darwin") {
    candidates.push(process.env.HOME + "/.wine/drive_c/Simba/");
    candidates.push(process.env.HOME + "/Simba/");
  } else {
    candidates.push(process.env.HOME + "/Simba/");
    candidates.push("/opt/Simba/");
  }
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function findSRLPath(simbaDir) {
  if (!simbaDir) return null;
  const includes = path.join(simbaDir, "Includes");
  const srlPaths = [
    path.join(includes, "SRL-T"),
    path.join(includes, "SRL"),
    path.join(includes, "SRL-Development"),
    path.join(includes, "srl-osr"),
  ];
  for (const p of srlPaths) {
    if (fs.existsSync(path.join(p, "osr.simba"))) return p;
  }
  return null;
}

function findWaspLibPath(simbaDir) {
  if (!simbaDir) return null;
  const includes = path.join(simbaDir, "Includes");
  const waspPaths = [
    path.join(includes, "WaspLib"),
    path.join(includes, "wasplib"),
    path.join(includes, "WaspLib-main"),
  ];
  for (const p of waspPaths) {
    if (fs.existsSync(path.join(p, "osr.simba"))) return p;
  }
  return null;
}

export default async () => ({
  "experimental.chat.system.transform": async (_input, output) => {
      const instructions = getSRLInstructions();
      if (instructions) {
        output.system.push(instructions);
      }
      output.system.push(`## SRL Scripting Plugin — Available Agents

You have the SRL Scripting plugin loaded. The following S- agents are available:

### Mode (single orchestrator):
- **S-Plan** — the only mode. Orchestrates everything: planning, architecture, implementation, review, refactoring. Invoke S-Plan with your script idea to begin.

### Sub-agents (invoked by S-Plan):
- **S-Arch** — Script architecture design (state machines, phase machines, anti-ban strategy)
- **S-Tech** — API selection (which SRL-T/WaspLib modules fit the task)
- **S-Impl** — Writing production Simba/Pascal code
- **S-Refactor** — Code improvement without changing behavior
- **S-Audit** — Combined logic validation + adversarial stress test
- **S-Sentry** — Anti-ban/anti-detection audit
- **S-Perf** — Script performance optimization

Use these agents by invoking S-AgentName when working on OSRS Simba scripts.`);

      const simbaDir = findSimbaInstall();
      if (simbaDir) {
        const srlPath = findSRLPath(simbaDir);
        const waspPath = findWaspLibPath(simbaDir);
        let envInfo = `\n## Local Environment Detected\n`;
        envInfo += `Simba install: ${simbaDir}\n`;
        envInfo += `SRL-T: ${srlPath ? "found at " + srlPath : "NOT FOUND"}\n`;
        envInfo += `WaspLib: ${waspPath ? "found at " + waspPath : "NOT FOUND"}\n`;
        output.system.push(envInfo);
      }
    },

    tool: {
      "check-script-readiness": tool({
        description:
          "Check a set of .simba files for script readiness. Scans for TODOs, FIXMEs, HACKs, empty stubs, missing anti-ban, hardcoded waits, missing includes, and infinite loops. Run before considering a script complete.",
        args: {
          files: tool.schema
            .array(tool.schema.string())
            .describe("Array of .simba file paths to check (relative to project root)."),
        },
        async execute(args, context) {
          if (!args.files || args.files.length === 0) {
            return "No files provided. Pass an array of .simba file paths to check.";
          }
          const cwd = context?.cwd || process.cwd();
          const issues = checkScriptReadiness(args.files, cwd);
          if (issues.length === 0) {
            return "No issues found. These scripts look solid.";
          }
          let result = "SCRIPT READINESS ISSUES:\n\n";
          for (const { file, issue } of issues) {
            result += `  ${file}: ${issue}\n`;
          }
          return result;
        },
      }),

      "check-srl-api": tool({
        description:
          "Fetch current SRL-T API documentation for a specific module or function. Use this to verify correct function signatures, parameter types, or available methods. Provide a module name (e.g. 'bank', 'inventory', 'walker', 'antiban') or leave empty for the full module index.",
        args: {
          module: tool.schema
            .string()
            .optional()
            .describe("The SRL-T module name to look up (e.g. 'bank', 'inventory', 'combat', 'walker', 'magic', 'prayer', 'antiban', 'minimap', 'login', 'grandexchange'). If empty, returns the module index."),
        },
        async execute(args) {
          const module = (args.module || "").trim().toLowerCase();
          const base = "https://torwent.github.io/SRL-T";
          if (!module) {
            try {
              const resp = await fetch(base + "/");
              const text = await resp.text();
              const moduleLinks = text.match(/href="([^"]+\.html)"/g) || [];
              const modules = moduleLinks
                .map(m => m.replace(/^href="/, "").replace(/"$/, ""))
                .filter(m => !m.includes("search") && !m.startsWith("http") && !m.startsWith("#"))
                .map(m => m.replace(/\.html$/, "").replace(/\(|\)/g, ""))
                .filter(Boolean);
              return "SRL-T Module Index:\n\n" + modules.map(m => "  " + m).join("\n") + "\n\nUse check-srl-api with a module name to see its API.";
            } catch {
              return "https://torwent.github.io/SRL-T/\n\nCould not fetch the module index. The site may be unreachable. Refer to the AGENTS-SRL.md for documented APIs.";
            }
          }
          const moduleUrls = [
            module,
            module.replace(/ /g, ""),
            module.replace(/ /g, "_"),
            module.replace(/ /g, "-"),
          ];
          for (const url of moduleUrls) {
            const fullUrl = `${base}/${url}.html`;
            try {
              const resp = await fetch(fullUrl);
              if (resp.ok) {
                const text = await resp.text();
                const clean = text
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                  .replace(/<[^>]+>/g, "\n")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();
                const content = clean.length > 4000 ? clean.substring(0, 4000) + "\n... (truncated, see full docs at " + fullUrl + ")" : clean;
                return content || "Module found but content is empty. See: " + fullUrl;
              }
            } catch {}
          }
          return "Could not find documentation for module '" + module + "'. Check the SRL-T docs site: " + base;
        },
      }),

      "check-wasplib-api": tool({
        description:
          "Fetch current WaspLib API documentation for a specific module or function. Use this to verify correct function signatures, parameter types, or available methods in WaspLib. Provide a module name (e.g. 'basescript', 'progress', 'walker', 'consumablehandler', 'bank', 'inventory') or leave empty for the full module index.",
        args: {
          module: tool.schema
            .string()
            .optional()
            .describe("The WaspLib module name to look up (e.g. 'basescript', 'progress', 'walker', 'consumablehandler', 'bank', 'inventory', 'login', 'combathandler', 'loothandler'). If empty, returns the module index."),
        },
        async execute(args) {
          const module = (args.module || "").trim().toLowerCase();
          const base = "https://torwent.github.io/WaspLib";
          if (!module) {
            try {
              const resp = await fetch(base + "/");
              const text = await resp.text();
              const moduleLinks = text.match(/href="([^"]+\.html)"/g) || [];
              const modules = moduleLinks
                .map(m => m.replace(/^href="/, "").replace(/"$/, ""))
                .filter(m => !m.includes("search") && !m.startsWith("http") && !m.startsWith("#") && !m.startsWith("_"))
                .map(m => m.replace(/\.html$/, "").replace(/\(|\)/g, ""))
                .filter(Boolean);
              return "WaspLib Module Index:\n\n" + modules.map(m => "  " + m).join("\n") + "\n\nUse check-wasplib-api with a module name to see its API.";
            } catch {
              return "https://torwent.github.io/WaspLib/\n\nCould not fetch the module index. The site may be unreachable. Refer to the AGENTS-SRL.md for documented APIs.";
            }
          }
          const moduleUrls = [
            module,
            module.replace(/ /g, ""),
            module.replace(/ /g, "_"),
            module.replace(/ /g, "-"),
          ];
          for (const url of moduleUrls) {
            const fullUrl = `${base}/${url}.html`;
            try {
              const resp = await fetch(fullUrl);
              if (resp.ok) {
                const text = await resp.text();
                const clean = text
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                  .replace(/<[^>]+>/g, "\n")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();
                const content = clean.length > 4000 ? clean.substring(0, 4000) + "\n... (truncated, see full docs at " + fullUrl + ")" : clean;
                return content || "Module found but content is empty. See: " + fullUrl;
              }
            } catch {}
          }
          return "Could not find documentation for module '" + module + "'. Check the WaspLib docs site: " + base;
        },
      }),

      "fetch-osrs-wiki": tool({
        description:
          "Fetch data from the OSRS wiki for a specific item, monster, or quest. Use this to get accurate item IDs, monster stats, drop tables, skill requirements, or quest info for script development.",
        args: {
          query: tool.schema
            .string()
            .describe("The OSRS wiki search term (e.g. 'Rune scimitar', 'Abyssal demon', 'Dragon Slayer II'). Be specific for best results."),
        },
        async execute(args) {
          const query = (args.query || "").trim();
          if (!query) return "Provide a search term. Examples: 'Rune scimitar', 'Abyssal demon', 'Dragon Slayer II'.";
          try {
            const searchUrl = "https://oldschool.runescape.wiki/api.php?action=query&list=search&srsearch=" +
              encodeURIComponent(query) + "&format=json&srlimit=1";
            const searchResp = await fetch(searchUrl);
            const searchData = await searchResp.json();
            const pages = searchData?.query?.search;
            if (!pages || pages.length === 0) {
              return "No results found for '" + query + "' on the OSRS wiki.";
            }
            const title = pages[0].title;
            const pageUrl = "https://oldschool.runescape.wiki/api.php?action=parse&page=" +
              encodeURIComponent(title) + "&format=json&prop=text&section=0&redirects=1";
            const pageResp = await fetch(pageUrl);
            const pageData = await pageResp.json();
            const text = pageData?.parse?.text?.["*"] || "";
            const clean = text
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<table[^>]*>[\s\S]*?<\/table>/gi, " [table omitted] ")
              .replace(/<[^>]+>/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            const snippet = clean.length > 2000 ? clean.substring(0, 2000) + "\n\n... (see full page: https://oldschool.runescape.wiki/" + encodeURIComponent(title.replace(/ /g, "_")) + ")" : clean;
            return "OSRS Wiki: " + title + "\n\n" + snippet;
          } catch (e) {
            return "Failed to fetch OSRS wiki data. The site may be unreachable.";
          }
        },
      }),

      "create-script-skeleton": tool({
        description:
          "Generate a complete, production-ready Simba script skeleton for a given script type. Creates the file with proper includes, anti-ban, state machine structure, and progress report. Types: 'combat', 'skilling', 'gathering', 'bankstanding', 'quest', 'custom'.",
        args: {
          name: tool.schema
            .string()
            .describe("The script name (e.g. 'PowerChopper', 'AIOFighter', 'SuperheatMager'). Used for the program name and file name."),
          scriptType: tool.schema
            .string()
            .describe("The type of script: 'combat', 'skilling', 'gathering', 'bankstanding', 'slayer', 'custom'."),
          outputPath: tool.schema
            .string()
            .optional()
            .describe("Absolute path where the script file should be written. If omitted, returns the code as text."),
        },
        async execute(args) {
          const name = (args.name || "").trim();
          if (!name) return "Provide a script name (e.g. 'PowerChopper').";
          const scriptType = (args.scriptType || "").trim().toLowerCase();
          if (!["combat", "skilling", "gathering", "bankstanding", "slayer", "custom"].includes(scriptType)) {
            return "Invalid script type. Choose: 'combat', 'skilling', 'gathering', 'bankstanding', 'slayer', or 'custom'.";
          }

          const safeName = name.replace(/[^a-zA-Z0-9]/g, "");

          // Type-specific logic blocks
          let typeVars = '';
          let typeSetup = '';
          let typeTaskLogic = '';
          let typeBankLogic = '';
          let typeTransitions = '';

          switch (scriptType) {
            case 'combat':
              typeVars = `  gCombatKills: Integer;`;
              typeSetup = `  CombatHandler.Setup(RSMonsters.AnyMonster, 4000);`;
              typeTaskLogic = `  if not MainScreen.InCombat() then
  begin
    var monster: TRSNPCV2;
    OvershootAndCorrect(MainScreen.Center, RandomRange(5, 15));
    SimulateHumanReaction();
    MaybeMisclick(MainScreen.Center);
    if RSMonsters.AnyMonster.Find(monster) then
      monster.Interact('Attack');
    gTask := 'Attacking';
  end
  else
    gTask := 'In combat';
`;
              typeBankLogic = `  if Bank.Open() then
  begin
    Bank.DepositAll();
    Bank.Withdraw('Food', 5);
    Bank.Close();
  end;
`;
              typeTransitions = `  if (Inventory.FreeCount() <= 2) or (Combat.GetHP() < 40) then
    SetState(STATE_BANKING);`;
              break;
            case 'skilling':
              typeTaskLogic = `  OvershootAndCorrect(MainScreen.Center, RandomRange(8, 20));
  SimulateHumanReaction();
  MaybeMisclick(MainScreen.Center);
  Mouse.Click(MainScreen.Center, Mouse_Left);
  gTask := 'Skilling';
  Inc(gRuns);
`;
              typeBankLogic = `  if Bank.Open() then
  begin
    Bank.DepositAll();
    Bank.Close();
  end;
`;
              typeTransitions = `  if (Inventory.FreeCount() = 0) then
    SetState(STATE_BANKING);`;
              break;
            case 'gathering':
              typeVars = `  gDropSlot: Integer;`;
              typeSetup = `  SettingsHandler.SetupXPBar();`;
              typeTaskLogic = `  OvershootAndCorrect(MainScreen.Center, RandomRange(5, 15));
  SimulateHumanReaction();
  MaybeMisclick(MainScreen.Center);
  Mouse.Click(MainScreen.Center, Mouse_Left);
  gTask := 'Gathering';

  if Inventory.FreeCount() = 0 then
  begin
    for gDropSlot := 0 to 27 do
      if Inventory.IsSlotUsed(gDropSlot) then
        Inventory.DropUntil(0);
    Inc(gRuns);
  end;
`;
              typeTransitions = `  if (Inventory.FreeCount() = 0) then
    SetState(STATE_BANKING);`;
              break;
            case 'bankstanding':
              typeVars = `  gBankCycle: Integer;`;
              typeSetup = `  SettingsHandler.SetupXPBar();`;
              typeTaskLogic = `  OvershootAndCorrect(MainScreen.Center, RandomRange(5, 15));
  SimulateHumanReaction();
  MaybeMisclick(MainScreen.Center);
  Mouse.Click(MainScreen.Center, Mouse_Left);
  gTask := 'Processing';
  Inc(gRuns);
`;
              typeBankLogic = `  if Bank.Open() then
  begin
    Bank.DepositAll();
    Bank.Withdraw('Supplies', 28);
    Bank.Close();
  end;
`;
              typeTransitions = `  if (Inventory.FreeCount() = 0) then
    SetState(STATE_BANKING);`;
              break;
            case 'slayer':
              typeVars = `  gSlayerKills: Integer;`;
              typeSetup = `  CombatHandler.Setup(True, RSMonsters.AnyMonster, 5000);`;
              typeTaskLogic = `  CombatHandler.DoActions();
  gTask := 'Slayer task';
`;
              typeBankLogic = `  if Bank.Open() then
  begin
    CombatHandler.DoActions(ECombatState.REEQUIP_GEAR);
    Bank.Close();
  end;
`;
              typeTransitions = `  if (Inventory.FreeCount() <= 2) or (Combat.GetHP() < 40) then
    SetState(STATE_BANKING);`;
              break;
            default: // custom
              typeTaskLogic = `  OvershootAndCorrect(MainScreen.Center, RandomRange(5, 20));
  SimulateHumanReaction();
  MaybeMisclick(MainScreen.Center);
  Mouse.Click(MainScreen.Center, Mouse_Left);
  gTask := 'Working';
  Inc(gRuns);
`;
              typeBankLogic = `  if Bank.Open() then
  begin
    Bank.DepositAll();
    Bank.Close();
  end;
`;
              typeTransitions = `  if (Inventory.FreeCount() = 0) then
    SetState(STATE_BANKING);`;
          }

          const template = `program ${safeName};
{\$DEFINE SCRIPT_ID := '${safeName.toLowerCase()}'}
{\$DEFINE SCRIPT_REVISION := '1.0'}
{\$I WaspLib/osr.simba}

var
  gTask: String;
  gRuns: Integer;
  gScriptTime: TCountDown;
  gMisclickRoll: Integer;  // varies per session
  ${typeVars}

// ---- Anti-ban utilities ----
procedure SimulateHumanReaction();
begin
  // Humans don't react instantly. Vary delay per interaction.
  Wait(RandomRange(80, 350));
end;

procedure OvershootAndCorrect(Target: TPoint; Offset: Integer = -1);
var
  overshoot: TPoint;
begin
  if (Offset = -1) then
    Offset := RandomRange(10, 30);

  case Random(4) of
    0: overshoot := Point(Target.X + Offset, Target.Y);
    1: overshoot := Point(Target.X - Offset, Target.Y);
    2: overshoot := Point(Target.X, Target.Y + Offset);
    3: overshoot := Point(Target.X, Target.Y - Offset);
  end;

  // Move past the target via SMART-simulated mouse
  Mouse.Move(overshoot, 0, 0);
  Wait(RandomRange(50, 120));

  // Correct back to target with slight random offset
  Mouse.Move(Target, RandomRange(2, 5), RandomRange(2, 5));
  Wait(RandomRange(30, 80));
end;

procedure MaybeMisclick(Target: TPoint);
begin
  // 2-5% of clicks hit empty ground next to target
  if (Random(100) < gMisclickRoll) then
  begin
    Mouse.Click(Target, RandomRange(15, 40), RandomRange(15, 40), Mouse_Left);
    Wait(RandomRange(100, 250));
    // "Oh wait" — corrected in the caller
  end;
end;

// ---- Anti-ban (called every loop iteration) ----
procedure ExecuteAntiBan();
var
  roll: Integer;
begin
  roll := Random(100);
  if (roll < 15) then
  begin
    case Random(7) of
      0: Antiban.RandomMouseMovement();
      1: Antiban.RandomRClick();
      2: Antiban.RandomCheckXP();
      3: Antiban.RandomCheckInventory();
      4: Antiban.RandomHover();
      5: Antiban.RandomCheckCombat();
      6: Antiban.RandomCheckEquipment();
    end;
  end;
end;

// ---- State machine ----
type
  TScriptState = (STATE_STARTUP, STATE_EXECUTING, STATE_BANKING, STATE_IDLE);

var
  gState: TScriptState;
  gStateTime: TCountDown;

procedure SetState(NewState: TScriptState);
begin
  gState := NewState;
  gStateTime.Start(RandomRange(2000, 5000));
end;

// ---- Task logic (each action: react → overshoot → maybe misclick → click) ----
procedure ExecuteTask();
begin
  SimulateHumanReaction();
  ${typeTaskLogic}
end;

procedure BankProcedure();
begin
  SimulateHumanReaction();
  ${typeBankLogic}
end;

// ---- Progress report ----
procedure SetupProgress();
begin
  ProgressReport.AddLine('Task', @gTask);
  ProgressReport.AddLine('Runs', @IntToStr(gRuns));
  ProgressReport.Start(5000);
end;

// ---- Main loop (anti-ban is called every iteration) ----
procedure MainLoop();
begin
  SetState(STATE_STARTUP);
  ${typeSetup}
  gScriptTime.Start();

  repeat
    ExecuteAntiBan();

    case gState of
      STATE_STARTUP:
      begin
        WriteLn('Starting ${safeName} — script type: ${scriptType}');
        SetState(STATE_EXECUTING);
      end;

      STATE_EXECUTING:
      begin
        ExecuteTask();
        ${typeTransitions}
      end;

      STATE_BANKING:
      begin
        BankProcedure();
        SetState(STATE_EXECUTING);
      end;

      STATE_IDLE:
      begin
        Wait(RandomRange(2000, 5000));
        SetState(STATE_EXECUTING);
      end;
    end;

    Wait(RandomRange(200, 400));
  until(False);
end;

// ---- Entry ----
begin
  // Seed per-session variation — misclick rate changes each run
  gMisclickRoll := RandomRange(2, 6);

  ScriptStart('${safeName}', SCRIPT_REVISION);
  SetupProgress();
  MainLoop();
  ScriptEnd();
end.
`;

          if (args.outputPath) {
            try {
              fs.writeFileSync(args.outputPath, template, "utf8");
              return "Script skeleton written to: " + args.outputPath;
            } catch (e) {
              return "Failed to write file: " + e.message;
            }
          }
          return template;
        },
      }),
    },
  });
