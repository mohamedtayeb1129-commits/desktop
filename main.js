const { app, BrowserWindow, dialog, globalShortcut, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

const logFile = path.join(app.getPath("userData"), "app.log");

// If true: when the update check fails (offline, server down), the app does NOT open.
// If false: the app opens normally when the check fails.
const BLOCK_IF_CHECK_FAILS = false;

let mainWindow = null;
let updateWindow = null;

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

// Small window that shows the download progress
function createUpdateWindow() {
    updateWindow = new BrowserWindow({
        width: 420,
        height: 160,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        title: "Updating",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Closing this window cancels everything and quits the app
    updateWindow.on("closed", () => {
        updateWindow = null;
        log("Update window closed, quitting");
        app.quit();
    });

    const html =
        "<body style='font-family:sans-serif;text-align:center;padding-top:40px'>" +
        "<h3>Downloading update...</h3>" +
        "<div id='p' style='font-size:22px'>0%</div></body>";

    updateWindow.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html)
    );
}

function setUpdateProgress(percent) {
    if (updateWindow) {
        updateWindow.setProgressBar(percent / 100);
        updateWindow.webContents
            .executeJavaScript(
                "document.getElementById('p').textContent='" +
                    percent.toFixed(0) +
                    "%'"
            )
            .catch(() => {});
    }
}

// Resolves with { available: true/false } or { error }
function checkForUpdate() {
    return new Promise((resolve) => {
        autoUpdater.once("update-available", (info) =>
            resolve({ available: true, info })
        );
        autoUpdater.once("update-not-available", () =>
            resolve({ available: false })
        );
        autoUpdater.once("error", (err) => resolve({ error: err }));

        autoUpdater.checkForUpdates().catch((err) => resolve({ error: err }));
    });
}

function configureAutoUpdater() {
    autoUpdater.logger = {
        info: (...args) => log("UPDATER INFO:", ...args),
        warn: (...args) => log("UPDATER WARN:", ...args),
        error: (...args) => log("UPDATER ERROR:", ...args),
        debug: (...args) => log("UPDATER DEBUG:", ...args),
    };

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
}

// Returns after either: the app window is opened, or the app is quitting
async function startApp() {
    // Dev mode: no updater, open directly
    if (!app.isPackaged) {
        createWindow();
        return;
    }

    configureAutoUpdater();

    log("Checking for update...");
    const result = await checkForUpdate();

    // Check failed
    if (result.error) {
        log("Update check failed:", result.error.message);

        if (BLOCK_IF_CHECK_FAILS) {
            dialog.showErrorBox(
                "Cannot check for updates",
                "The app cannot start without checking for updates.\n\n" +
                    result.error.message
            );
            app.quit();
            return;
        }

        createWindow();
        return;
    }

    // Up to date
    if (!result.available) {
        log("No update available");
        createWindow();
        return;
    }

    // Update available: mandatory
    const version = result.info.version;
    log("Update available:", version);

    const { response } = await dialog.showMessageBox({
        type: "info",
        title: "Update required",
        message: "A new version (" + version + ") is available.",
        detail:
            "You are using version " +
            app.getVersion() +
            ". You must update to continue using the application.",
        buttons: ["Update now", "Quit"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
    });

    // Quit button or dialog closed
    if (response !== 0) {
        log("User refused the update, quitting");
        app.quit();
        return;
    }

    log("User accepted update, downloading...");
    createUpdateWindow();

    autoUpdater.on("download-progress", (progress) => {
        log("Download progress: " + progress.percent.toFixed(1) + "%");
        setUpdateProgress(progress.percent);
    });

    autoUpdater.once("update-downloaded", (info) => {
        log("Update downloaded:", info.version, "- installing");

        // Detach the "closed" handler so closing it now doesn't call app.quit() early
        if (updateWindow) {
            updateWindow.removeAllListeners("closed");
        }

        autoUpdater.quitAndInstall();
    });

    try {
        await autoUpdater.downloadUpdate();
    } catch (err) {
        log("Download failed:", err.message);
        dialog.showErrorBox(
            "Update failed",
            err.message + "\n\nThe application will now close."
        );
        app.quit();
    }
}

app.whenReady().then(() => {
    // Ctrl+Shift+L opens the log file
    globalShortcut.register("CommandOrControl+Shift+L", () => {
        shell.openPath(logFile);
    });

    startApp();
});

app.on("will-quit", () => {
    globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
    app.quit();
});