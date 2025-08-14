// extension.js
const vscode = require("vscode");
const { execFile } = require("child_process");

function checkCli(bin) {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { shell: true }, (err, stdout) => {
      if (err) return resolve({ ok: false, msg: err.message });
      resolve({ ok: true, version: (stdout || "").trim() });
    });
  });
}

async function ensureMaidInstalled() {
  const cfg = vscode.workspace.getConfiguration("maid");
  const bin = cfg.get("path") || "maid";

  const result = await checkCli(bin);
  if (result.ok) return bin; // found! <3

  const choice = await vscode.window.showWarningMessage(
    "Maid CLI not found. Install it with Cargo?",
    "Install Now",
    "Set Custom Path…",
    "Cancel"
  );

  if (choice === "Install Now") {
    const term = vscode.window.createTerminal({ name: "Install Maid" });
    term.show(true);
    term.sendText("cargo install maid-lang --force");
    // We return the default bin name; user can run again after install finishes.
    return bin;
  }

  if (choice === "Set Custom Path…") {
    const newPath = await vscode.window.showInputBox({
      prompt: "Enter full path to the maid executable",
      placeHolder:
        process.platform === "win32"
          ? "e.g. C:\\Users\\you\\.cargo\\bin\\maid.exe"
          : "/home/you/.cargo/bin/maid",
      value: bin
    });
    if (newPath) {
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
  }

  return null; // user canceled
}

function activate(context) {
  // check once on activation (useful for when a .maid file opens)
  ensureMaidInstalled();

  const runCmd = vscode.commands.registerCommand(
    "maid.runCurrentFile",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const bin = await ensureMaidInstalled();
      if (!bin) return; // user canceled / not installed

      const cfg = vscode.workspace.getConfiguration("maid");
      const extra = cfg.get("args") || [];

      const file = editor.document.fileName;
      const quoted = file.includes(" ") ? `"${file}"` : file;

      const term = vscode.window.createTerminal({ name: "Maid" });
      term.show(true);
      term.sendText([bin, ...extra, quoted].join(" "));
    }
  );

  context.subscriptions.push(runCmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
