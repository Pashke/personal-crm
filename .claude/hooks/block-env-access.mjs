// PreToolUse hook for Bash and PowerShell: blocks any command that mentions a .env file.
// The Read tool is already denied by permissions in settings.json; this closes the terminal route
// (cat .env, Get-Content .env, type .env, ...). It guards against accidental reads, not deliberate obfuscation.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = String(input.tool_input?.command ?? "");

// Matches ".env", ".env.local", "./.env", "C:\project\.env", but not "process.env".
const ENV_FILE = /(?<![\w$])\.env/i;

if (ENV_FILE.test(command)) {
  console.error(
    "Blocked by .claude/hooks/block-env-access.mjs: the command mentions a .env file, which holds secrets. " +
      "Do not read .env from the terminal. If its contents are really needed, ask the user to run the command themselves.",
  );
  process.exit(2);
}
