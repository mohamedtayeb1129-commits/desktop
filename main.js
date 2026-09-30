const { app, BrowserWindow, dialog, globalShortcut, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

const logFile = path.join(app.getPath("userData"), "app.log");

let mainWindow = null;

function log(...args) {
    const line = "[" + new Date().toISOString() + "] " + args.join(" ") + "\n";

    try {
        fs.appendFileSync(logFile, line);
    } catch (err) {
        console.error("Could not write log:", err);
    }

    console.log(...args);
}

// Catch anything unhandled in the main process
process.on("uncaughtException", (err) => {
    log("UNCAUGHT EXCEPTION:", err.stack || err.message);

    if (app.isReady()) {
        dialog.showErrorBox("Startup error", err.message);
    }
});

process.on("unhandledRejection", (reason) => {
    log(
        "UNHANDLED REJECTION:",
        reason && reason.stack ? reason.stack : String(reason)
    );
});

function createWindow() {
    try {
        mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,

            webPreferences: {
                devTools: true,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        mainWindow.on("closed", () => {
            mainWindow = null;
        });

        mainWindow.webContents.on("did-fail-load", (event, code, desc) => {
            log("PAGE LOAD FAILED:", code, desc);
        });

        const indexPath = path.join(__dirname, "frontend", "index.html");

        log(
            "Loading frontend from:",
            indexPath,
            "exists:",
            fs.existsSync(indexPath)
        );

        mainWindow.loadFile(indexPath);
    } catch (err) {
        log("WINDOW CREATION FAILED:", err.stack || err.message);
    }
}

function setupAutoUpdater() {
    autoUpdater.logger = {
        info: (...args) => log("UPDATER INFO:", ...args),
        warn: (...args) => log("UPDATER WARN:", ...args),
        error: (...args) => log("UPDATER ERROR:", ...args),
        debug: (...args) => log("UPDATER DEBUG:", ...args),
    };

    // Ask the user first: do NOT download automatically
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
        log("Checking for update...");
    });

    autoUpdater.on("update-available", async (info) => {
        log("Update available:", info.version);

        const { response } = await dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Update available",
            message: "A new version (" + info.version + ") is available.",
            detail:
                "You are using version " +
                app.getVersion() +
                ". Do you want to download and install the update?",
            buttons: ["Update now", "Later"],
            defaultId: 0,
            cancelId: 1,
        });

        if (response === 0) {
            log("User accepted update, downloading...");
            autoUpdater.downloadUpdate().catch((err) => {
                log("Download failed:", err.message);
                dialog.showErrorBox("Update failed", err.message);
            });
        } else {
            log("User postponed update");
        }
    });

    autoUpdater.on("update-not-available", (info) => {
        log("No update available. Current version:", info.version);
    });

    autoUpdater.on("error", (err) => {
        log("UPDATE ERROR:", err.stack || err.message);
    });

    autoUpdater.on("download-progress", (progress) => {
        log("Download progress: " + progress.percent.toFixed(1) + "%");

        // Show progress on the taskbar icon
        if (mainWindow) {
            mainWindow.setProgressBar(progress.percent / 100);
        }
    });

    autoUpdater.on("update-downloaded", async (info) => {
        log("Update downloaded:", info.version);

        if (mainWindow) {
            mainWindow.setProgressBar(-1);
        }

        const { response } = await dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Update ready",
            message: "Version " + info.version + " has been downloaded.",
            detail: "Restart the application now to install it?",
            buttons: ["Restart now", "Later"],
            defaultId: 0,
            cancelId: 1,
        });

        if (response === 0) {
            autoUpdater.quitAndInstall();
        } else {
            log("User postponed install, will install on quit");
        }
    });

    autoUpdater.checkForUpdates().catch((err) => {
        log("Update check failed:", err.message);
    });
}

app.whenReady().then(() => {
    createWindow();

    // Ctrl+Shift+L opens the log file
    globalShortcut.register("CommandOrControl+Shift+L", () => {
        shell.openPath(logFile);
    });

    // Only check for updates in the packaged application
    if (app.isPackaged) {
        setupAutoUpdater();
    }
});

app.on("will-quit", () => {
    globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
    app.quit();
});