// extension.js
const vscode = require("vscode");
const { execFile } = require("child_process");

function run(cmd, args = []) {
  return new Promise((resolve) => {
    execFile(cmd, args, { shell: true }, (err, stdout = "", stderr = "") => {
      if (err) return resolve({ ok: false, stdout, stderr, err });
      resolve({ ok: true, stdout, stderr });
    });
  });
}

async function checkCli(bin, versionArg = "--version") {
  const r = await run(bin, [versionArg]);
  if (!r.ok) return { ok: false, version: null, msg: r.stderr || r.stdout };
  return { ok: true, version: (r.stdout || "").trim() };
}

async function ensureCargo() {
  const cargo = await checkCli("cargo");
  if (cargo.ok) return true;

  const choice = await vscode.window.showWarningMessage(
    "Cargo (Rust toolchain) was not found. Install Rust (rustup) to proceed?",
    "Open Installer",
    "Cancel"
  );
  if (choice === "Open Installer") {
    await vscode.env.openExternal(vscode.Uri.parse("https://rustup.rs/"));
    vscode.window.showInformationMessage(
      "Install Rust, then restart VS Code (or your terminal) so PATH is updated."
    );
  }
  return false;
}

async function cargoInstallMaid() {
  // show progress and wait for cargo to finish
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Installing maid-lang via Cargo…" },
    async () => {
      const r = await run("cargo", ["install", "maid-lang", "--force"]);
      if (!r.ok) {
        vscode.window.showErrorMessage(
          "Cargo install failed. See output for details."
        );
        // surface a bit of stderr/stdout in OUTPUT -> "Maid"
        const ch = vscode.window.createOutputChannel("Maid");
        ch.appendLine(r.stderr || r.stdout || String(r.err));
        ch.show(true);
        return false;
      }
      vscode.window.showInformationMessage("maid-lang installed successfully.");
      return true;
    }
  );
}

async function ensureMaidInstalled() {
  const cfg = vscode.workspace.getConfiguration("maid");
  let bin = cfg.get("path") || "maid";

  // 1) Already present?
  if ((await checkCli(bin)).ok) return bin;

  // 2) Offer to install or set custom path
  const choice = await vscode.window.showWarningMessage(
    "Maid CLI not found. How would you like to proceed?",
    "Install with Cargo",
    "Set Custom Path…",
    "Cancel"
  );

  if (choice === "Set Custom Path…") {
    const newPath = await vscode.window.showInputBox({
      prompt: "Enter full path to the maid executable",
      placeHolder:
        process.platform === "win32"
          ? "C:\\Users\\you\\.cargo\\bin\\maid.exe"
          : "/home/you/.cargo/bin/maid",
      value: bin
    });
    if (!newPath) return null;
    await cfg.update("path", newPath, vscode.ConfigurationTarget.Global);
    const recheck = await checkCli(newPath);
    if (!recheck.ok) {
      vscode.window.showErrorMessage(
        "That path didn’t work. Try installing via Cargo or double-check the path."
      );
      return null;
    }
    return newPath;
  }

  if (choice === "Install with Cargo") {
    // 3) Make sure cargo exists
    const has = await ensureCargo();
    if (!has) return null;

    // 4) Install and WAIT
    const ok = await cargoInstallMaid();
    if (!ok) return null;

    // 5) Re-check maid; on Windows PATH might need a reload, so retry common locations
    const post = await checkCli(bin);
    if (post.ok) return bin;

    // Try default cargo bin path on Windows if user’s shell PATH hasn’t refreshed
    if (process.platform === "win32") {
      const guess = `${process.env.USERPROFILE}\\.cargo\\bin\\maid.exe`;
      if ((await checkCli(guess)).ok) {
        await cfg.update("path", guess, vscode.ConfigurationTarget.Global);
        return guess;
      }
    }

    vscode.window.showInformationMessage(
      "If the command is still not found, restart VS Code so PATH picks up the new Cargo bin folder, then run again."
    );
    return null;
  }

  return null; // canceled
}

function activate(context) {
  // Optional: only prompt when needed; remove this if you prefer prompting on activation
  // ensureMaidInstalled();

  const runCmd = vscode.commands.registerCommand("maid.runCurrentFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const bin = await ensureMaidInstalled();
    if (!bin) return;

    const cfg = vscode.workspace.getConfiguration("maid");
    const extra = cfg.get("args") || [];

    const file = editor.document.fileName;
    const quoted = file.includes(" ") ? `"${file}"` : file;

    const term = vscode.window.createTerminal({ name: "Maid" });
    term.show(true);
    term.sendText([bin, ...extra, quoted].join(" "));
  });

  context.subscriptions.push(runCmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
