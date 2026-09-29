const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

const logFile = path.join(app.getPath("userData"), "app.log");

function log(...args) {
    const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;

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

    dialog.showErrorBox(
        "Startup error",
        err.message
    );
});

function createWindow() {
    try {
        const win = new BrowserWindow({
            width: 1400,
            height: 900,

            webPreferences: {
                devTools: true,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        win.webContents.on("did-fail-load", (event, code, desc) => {
            log("PAGE LOAD FAILED:", code, desc);
        });

        /*
        // Block DevTools shortcuts

        win.webContents.on("before-input-event", (event, input) => {
            if (
                input.key === "F12" ||
                (
                    input.control &&
                    input.shift &&
                    input.key.toLowerCase() === "i"
                ) ||
                (
                    input.control &&
                    input.shift &&
                    input.key.toLowerCase() === "j"
                )
            ) {
                event.preventDefault();
            }
        });

        // Disable right-click context menu

        win.webContents.on("context-menu", (event) => {
            event.preventDefault();
        });
        */

        const indexPath = path.join(
            __dirname,
            "./frontend/index.html"
        );

        log(
            "Loading frontend from:",
            indexPath,
            "exists:",
            fs.existsSync(indexPath)
        );

        win.loadFile(indexPath);

    } catch (err) {
        log(
            "WINDOW CREATION FAILED:",
            err.stack || err.message
        );
    }
}

function setupAutoUpdater() {
    autoUpdater.logger = {
        info: (...args) => log("UPDATER INFO:", ...args),
        warn: (...args) => log("UPDATER WARN:", ...args),
        error: (...args) => log("UPDATER ERROR:", ...args),
        debug: (...args) => log("UPDATER DEBUG:", ...args),
    };

    autoUpdater.on("checking-for-update", () => {
        log("Checking for update...");
    });

    autoUpdater.on("update-available", (info) => {
        log("Update available:", info.version);
    });

    autoUpdater.on("update-not-available", (info) => {
        log("No update available. Current version:", info.version);
    });

    autoUpdater.on("error", (err) => {
        log("UPDATE ERROR:", err.stack || err.message);
    });

    autoUpdater.on("download-progress", (progress) => {
        log(
            `Download progress: ${progress.percent.toFixed(1)}%`
        );
    });

    autoUpdater.on("update-downloaded", (info) => {
        log("Update downloaded:", info.version);

        const result = dialog.showMessageBoxSync({
            type: "info",
            title: "Update available",
            message: `Version ${info.version} has been downloaded.`,
            detail: "Restart the application to install the update.",
            buttons: [
                "Restart now",
                "Later",
            ],
            defaultId: 0,
            cancelId: 1,
        });

        if (result === 0) {
            autoUpdater.quitAndInstall();
        }
    });

    autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
    createWindow();

    // Only check for updates in the packaged application
    if (app.isPackaged) {
        setupAutoUpdater();
    }
});

app.on("window-all-closed", () => {
    app.quit();
});