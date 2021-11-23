const {ipcMain, Notification, shell} = require("electron");
const childProcess = require("child_process");
const process = require("process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const https = require("https");
const requestProgress = require("request-progress");
const request = require("request");
const sudo = require("sudo-prompt");

const homeDir = path.join(os.homedir(), "yakit-projects");
const secretDir = path.join(homeDir, "auth");
fs.mkdirSync(secretDir, {recursive: true})
const basicDir = path.join(homeDir, "base");
fs.mkdirSync(basicDir, {recursive: true})
const yakEngineDir = path.join(homeDir, "yak-engine")
fs.mkdirSync(yakEngineDir, {recursive: true})

const secretFile = path.join(secretDir, "yakit-remote.json");
const authMeta = [];
const basicKvPath = path.join(basicDir, "yakit-local.json")

const kvpairs = new Map();

const getKVPair = () => {
    const keys = [];
    kvpairs.forEach((_, e) => {
        keys.push(e)
    })
    keys.map(i => kvpairs.delete(i));

    try {
        const data = fs.readFileSync(basicKvPath);
        JSON.parse(data).forEach(i => {
            if (i["key"]) {
                kvpairs.set(i["key"], i["value"])
            }
        })
    } catch (e) {
    }
}
getKVPair()

const setKVPair = (k, v) => {
    kvpairs.set(`${k}`, v)

    try {
        fs.unlinkSync(basicKvPath)
    } catch (e) {
    }

    const pairs = []
    kvpairs.forEach((v, k) => {
        pairs.push({key: k, value: v})
    })
    pairs.sort((a, b) => a.key.localeCompare(b.key))
    fs.writeFileSync(basicKvPath, new Buffer(JSON.stringify(pairs), "utf8"))
}

const loadSecrets = () => {
    authMeta.splice(0, authMeta.length)
    try {
        const data = fs.readFileSync(path.join(secretDir, "yakit-remote.json"));
        JSON.parse(data).forEach(i => {
            if (!(i["host"] && i["port"])) {
                return
            }

            authMeta.push({
                name: i["name"] || `${i["host"]}:${i["port"]}`,
                host: i["host"],
                port: i["port"],
                tls: i["tls"] | false,
                password: i["password"] || "",
                caPem: i["caPem"] || "",
            })
        })
    } catch (e) {
        console.info(e)
    }
};

function saveSecret(name, host, port, tls, password, caPem) {
    if (!host || !port) {
        throw new Error("empty host or port")
    }

    authMeta.push({
        host, port, tls, password, caPem,
        name: name || `${host}:${port}`,
    })
    saveAllSecret([...authMeta])
};

const isWindows = process.platform === "win32";

const saveAllSecret = (authInfos) => {
    try {
        fs.unlinkSync(secretFile)
    } catch (e) {

    }


    const authFileStr = JSON.stringify(
        [...authInfos.filter((v, i, arr) => {
            return arr.findIndex(origin => origin.name === v.name) === i
        })]
    );
    fs.writeFileSync(secretFile, new Buffer(authFileStr, "utf8"))
};

const getWindowsInstallPath = () => {
    const systemRoot = process.env["WINDIR"] || process.env["windir"] || process.env["SystemRoot"];
    return path.join(systemRoot, "System32", "yak.exe")
}

loadSecrets()

const getYakDownloadUrl = () => {
    switch (process.platform) {
        case "darwin":
            return "https://yaklang.oss-cn-beijing.aliyuncs.com/yak/latest/yak_darwin_amd64"
        case "win32":
            return "https://yaklang.oss-cn-beijing.aliyuncs.com/yak/latest/yak_windows_amd64.exe"
        case "linux":
            return "https://yaklang.oss-cn-beijing.aliyuncs.com/yak/latest/yak_linux_amd64"
    }
}


const getYakitDownloadUrl = (version) => {
    switch (process.platform) {
        case "darwin":
            if (process.arch === "arm64") {
                return `https://yaklang.oss-cn-beijing.aliyuncs.com/yak/${version}/Yakit-${version}-darwin-arm64.dmg`
            } else {
                return `https://yaklang.oss-cn-beijing.aliyuncs.com/yak/${version}/Yakit-${version}-darwin-x64.dmg`
            }
        case "win32":
            return `https://yaklang.oss-cn-beijing.aliyuncs.com/yak/${version}/Yakit-${version}-windows-amd64.exe`
        case "linux":
            return `https://yaklang.oss-cn-beijing.aliyuncs.com/yak/${version}/Yakit-${version}-linux-amd64.AppImage`
    }
}

module.exports = {
    register: (win, getClient) => {
        ipcMain.handle("save-yakit-remote-auth", async (e, params) => {
            let {name, host, port, tls, caPem, password} = params;
            name = name || `${host}:${port}`
            saveAllSecret([...authMeta.filter(i => {
                return i.name !== name
            })]);
            loadSecrets()
            saveSecret(name, host, port, tls, password, caPem)
        })
        ipcMain.handle("remove-yakit-remote-auth", async (e, name) => {
            saveAllSecret([...authMeta.filter(i => {
                return i.name !== name
            })]);
            loadSecrets();
        })
        ipcMain.handle("get-yakit-remote-auth-all", async (e, name) => {
            loadSecrets()
            return authMeta;
        })
        ipcMain.handle("get-yakit-remote-auth-dir", async (e, name) => {
            return secretDir;
        })

        // asyncQueryLatestYakEngineVersion wrapper
        const asyncQueryLatestYakEngineVersion = (params) => {
            return new Promise((resolve, reject) => {
                let rsp = https.get("https://yaklang.oss-cn-beijing.aliyuncs.com/yak/latest/version.txt")
                rsp.on("response", rsp => {
                    rsp.on("data", data => {
                        resolve(`v${Buffer.from(data).toString("utf8")}`.trim())
                    }).on("error", err => reject(err))
                })
                rsp.on("error", reject)
            })
        }
        ipcMain.handle("query-latest-yak-version", async (e, params) => {
            return await asyncQueryLatestYakEngineVersion(params)
        });

        // asyncQueryLatestYakEngineVersion wrapper
        const asyncQueryLatestNotification = (params) => {
            return new Promise((resolve, reject) => {
                let rsp = https.get("https://yaklang.oss-cn-beijing.aliyuncs.com/yak/latest/notification.md")
                rsp.on("response", rsp => {
                    rsp.on("data", data => {
                        const passage = Buffer.from(data).toString();
                        if (passage.startsWith("# Yakit Notification")) {
                            resolve(passage)
                        } else {
                            resolve("")
                        }

                    }).on("error", err => reject(err))
                })
                rsp.on("error", reject)
            })
        }
        ipcMain.handle("query-latest-notification", async (e, params) => {
            return await asyncQueryLatestNotification(params)
        })

        // asyncQueryLatestYakEngineVersion wrapper
        const asyncQueryLatestYakitEngineVersion = (params) => {
            return new Promise((resolve, reject) => {
                let rsp = https.get("https://yaklang.oss-cn-beijing.aliyuncs.com/yak/latest/yakit-version.txt")
                rsp.on("response", rsp => {
                    rsp.on("data", data => {
                        resolve(`v${Buffer.from(data).toString("utf8")}`.trim())
                    }).on("error", err => reject(err))
                })
                rsp.on("error", reject)
            })
        }
        ipcMain.handle("query-latest-yakit-version", async (e, params) => {
            return await asyncQueryLatestYakitEngineVersion(params)
        })

        // asyncQueryLatestYakEngineVersion wrapper
        const asyncGetCurrentLatestYakVersion = (params) => {
            return new Promise((resolve, reject) => {
                childProcess.exec("yak -v", (err, stdout) => {
                    const version = stdout.replaceAll("yak version ", "").trim();
                    if (!version) {
                        if (err) {
                            reject(err)
                        } else {
                            reject("[unknown reason] cannot fetch yak version (yak -v)")
                        }
                    } else {
                        resolve(version)
                    }
                })
            })
        }
        ipcMain.handle("get-current-yak", async (e, params) => {
            return await asyncGetCurrentLatestYakVersion(params)
        })

        // asyncDownloadLatestYak wrapper
        const asyncDownloadLatestYak = (version) => {
            return new Promise((resolve, reject) => {
                const dest = path.join(yakEngineDir, `yak-${version}`);
                try {
                    fs.unlinkSync(dest)
                } catch (e) {

                }

                const downloadUrl = getYakDownloadUrl();
                // https://github.com/IndigoUnited/node-request-progress
                // The options argument is optional so you can omit it
                requestProgress(request(downloadUrl), {
                    // throttle: 2000,                    // Throttle the progress event to 2000ms, defaults to 1000ms
                    // delay: 1000,                       // Only start to emit after 1000ms delay, defaults to 0ms
                    // lengthHeader: 'x-transfer-length'  // Length header to use, defaults to content-length
                })
                    .on('progress', function (state) {
                        win.webContents.send("download-yak-engine-progress", state)
                    })
                    .on('error', function (err) {
                        reject(err)
                    })
                    .on('end', function () {
                        resolve()
                    }).pipe(fs.createWriteStream(dest));
            })
        }
        ipcMain.handle("download-latest-yak", async (e, version) => {
            return await asyncDownloadLatestYak(version)
        })

        // asyncDownloadLatestYakit wrapper
        const asyncDownloadLatestYakit = (version) => {
            return new Promise((resolve, reject) => {
                if (version.startsWith("v")) {
                    version = version.substr(1)
                }
                const downloadUrl = getYakitDownloadUrl(version);

                const dest = path.join(yakEngineDir, path.basename(downloadUrl));
                try {
                    fs.unlinkSync(dest)
                } catch (e) {

                }
                // https://github.com/IndigoUnited/node-request-progress
                // The options argument is optional so you can omit it
                requestProgress(request(downloadUrl), {
                    // throttle: 2000,                    // Throttle the progress event to 2000ms, defaults to 1000ms
                    // delay: 1000,                       // Only start to emit after 1000ms delay, defaults to 0ms
                    // lengthHeader: 'x-transfer-length'  // Length header to use, defaults to content-length
                })
                    .on('progress', function (state) {
                        win.webContents.send("download-yakit-engine-progress", state)
                    })
                    .on('error', function (err) {
                        reject(err)
                    })
                    .on('end', function () {
                        resolve()
                    }).pipe(fs.createWriteStream(dest));
            })
        }
        ipcMain.handle("download-latest-yakit", async (e, version) => {
            return await asyncDownloadLatestYakit(version)
        })

        ipcMain.handle("get-windows-install-dir", async (e) => {
            //systemRoot := os.Getenv("WINDIR")
            // 			if systemRoot == "" {
            // 				systemRoot = os.Getenv("windir")
            // 			}
            // 			if systemRoot == "" {
            // 				systemRoot = os.Getenv("SystemRoot")
            // 			}
            //
            // 			if systemRoot == "" {
            // 				return utils.Errorf("cannot fetch windows system root dir")
            // 			}
            //
            // 			installed = filepath.Join(systemRoot, "System32", "yak.exe")
            if (process.platform !== "win32") {
                return "%WINDIR%\\System32\\yak.exe"
            }
            return getWindowsInstallPath();
        });

        const installYakEngine = (version) => {
            return new Promise((resolve, reject) => {
                const origin = path.join(yakEngineDir, `yak-${version}`);

                const dest = isWindows ? getWindowsInstallPath() : "/usr/local/bin/yak";

                const install = () => {
                    sudo.exec(
                        isWindows ?
                            `copy ${origin} ${dest}` : `mkdir -p /usr/local/bin && cp ${origin} ${dest} && chmod +x ${dest}`,
                        {
                            name: "Install Yak Binary"
                        }, err => {
                            if (err) {
                                reject(err)
                            } else {
                                resolve()
                            }
                        })
                }

                // 如果检测不到这个文件，就返回不存在
                if (!fs.existsSync(dest)) {
                    install()
                } else {
                    try {
                        const cmd = isWindows ? `del /f ${dest}` : `rm ${dest}`;
                        sudo.exec(cmd, {
                            name: "Delete Old Yak"
                        }, err => {
                            install()
                        })
                    } catch (e) {
                        console.info(e)
                        install()
                    }

                }

                // fs.access(dest, fs.constants.R_OK, ok => {
                //     if (!ok) {
                //         install()
                //         return
                //     }
                //
                //     let cmd = isWindows ? `del /f ${dest}` : `rm ${dest}`;
                //     sudo.exec(cmd, {
                //         name: "Delete Old Yak"
                //     }, err => {
                //         install()
                //     })
                // })
            })
        }

        ipcMain.handle("install-yak-engine", async (e, version) => {
            return await installYakEngine(version);
        })

        // 获取当前是否是 arm64？
        ipcMain.handle("get-platform-and-arch", (e) => {
            return `${process.platform}-${process.arch}`;
        })

        ipcMain.handle("install-yakit", async (e, params) => {
            return shell.openPath(yakEngineDir)
        })


        ipcMain.handle("set-value", (e, key, value) => {
            setKVPair(key, value)
        })

        ipcMain.handle("get-value", (e, key) => {
            getKVPair()
            return kvpairs.get(key)
        })
    },
}