const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

let mainWindow;
let pythonProcess = null;

function createWindow() {
  // Remove the default menu bar
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 600,
    icon: path.join(__dirname, "..", "assets", "icon", "StatementGuard.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    backgroundColor: "#f0f2f5",
  });
  const rendererPath = app.isPackaged
    ? path.join(process.resourcesPath, "renderer")
    : path.join(__dirname, "..", "renderer");

  mainWindow.loadFile(path.join(rendererPath, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    killPython();
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  killPython();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- IPC Handlers ----

// File selection dialog
ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Text Files", extensions: ["txt"] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Save file dialog (for CSV export)
ipcMain.handle("save-file", async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (result.canceled) return null;
  return result.filePath;
});

// Write CSV file
ipcMain.handle("write-csv", async (event, filePath, csvContent) => {
  try {
    fs.writeFileSync(filePath, csvContent, "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Run validation process
ipcMain.handle("run-validation", async (event, params) => {
  return new Promise((resolve, reject) => {
    let bridgeCmd, bridgeArgs, bridgeCwd;

    if (app.isPackaged) {
      // Production: use compiled bridge.exe from extraResources
      const bridgeExe = path.join(process.resourcesPath, "bridge", "bridge.exe");
      bridgeCmd = bridgeExe;
      bridgeArgs = [];
      bridgeCwd = process.resourcesPath;
    } else {
      // Development: use python
      const bridgePath = path.join(__dirname, "..", "bridge.py");
      bridgeCmd = process.platform === "win32" ? "python" : "python3";
      bridgeArgs = [bridgePath];
      bridgeCwd = path.join(__dirname, "..");
    }

    pythonProcess = spawn(bridgeCmd, bridgeArgs, {
      cwd: bridgeCwd,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      const text = data.toString();
      // Check for progress and data updates
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("PROGRESS:")) {
          const progressData = JSON.parse(line.substring(9));
          mainWindow.webContents.send("validation-progress", progressData);
        } else if (line.startsWith("DATA:")) {
          const dataPayload = JSON.parse(line.substring(5));
          mainWindow.webContents.send("validation-data", dataPayload);
        } else if (line.trim()) {
          stdout += line;
        }
      }
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      pythonProcess = null;
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(
            new Error(`Failed to parse output: ${stdout}\nStderr: ${stderr}`),
          );
        }
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });

    pythonProcess.on("error", (err) => {
      pythonProcess = null;
      reject(new Error(`Failed to start Python: ${err.message}`));
    });

    // Send parameters to Python process
    const input = JSON.stringify(params) + "\n";
    pythonProcess.stdin.write(input);
    pythonProcess.stdin.end();
  });
});

function killPython() {
  if (pythonProcess) {
    try {
      pythonProcess.kill();
    } catch (e) {
      // ignore
    }
    pythonProcess = null;
  }
}
