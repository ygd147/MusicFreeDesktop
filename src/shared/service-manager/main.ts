import { ChildProcess, fork } from "child_process";
import { ipcMain } from "electron";
import { IWindowManager } from "@/types/main/window-manager";
import { ServiceName } from "@shared/service-manager/common";
import getResourcePath from "@/common/main/get-resource-path";
import messageBus from "@shared/message-bus/main";
import http from 'http'
import { RepeatMode } from "@/common/constant";

class ServiceInstance {
    private serviceProcess: ChildProcess = null;
    private retryTimeOut = 6000;
    private started = false;
    private subprocessName: string;

    private hostChangeCallback: (host: string | null) => void;

    public serviceName: string;

    constructor(serviceName: string, subprocessPath: string) {
        this.serviceName = serviceName;
        this.subprocessName = subprocessPath;
    }


    onHostChange(callback: (host: string | null) => void) {
        this.hostChangeCallback = callback;
    }


    start() {
        startServer()
        if (this.started) {
            return;
        }
        this.started = true;
        const servicePath = getResourcePath(".service/" + this.subprocessName + ".js");
        this.serviceProcess = fork(servicePath);

        interface IMessage {
            type: "port",
            port: number
        }

        this.serviceProcess.on("message", (msg: IMessage) => {
            const host = "http://127.0.0.1:" + msg.port;
            this.hostChangeCallback(host);
        })

        this.serviceProcess.on("error", () => {
            if (this.started) {
                setTimeout(() => {
                    this.start(); // 自动重启子进程
                }, this.retryTimeOut);

                this.retryTimeOut = this.retryTimeOut > 300000 ? 300000 : this.retryTimeOut * 2;
            }
        })

        this.serviceProcess.on("exit", (code) => {
            if (this.started) {
                console.error(`Service exited with code ${code}. Restarting...`);
                setTimeout(() => {
                    this.start(); // 自动重启子进程
                }, this.retryTimeOut);

                this.retryTimeOut = this.retryTimeOut > 300000 ? 300000 : this.retryTimeOut * 2;
            }
        });
    }


    stop() {
        this.started = false;
        this.serviceProcess.removeAllListeners();
        this.serviceProcess.kill();
        this.serviceProcess = null;
        this.retryTimeOut = 6000;
        this.hostChangeCallback(null);
    }
}

interface IServiceData {
    instance: ServiceInstance;
    host: string | null;
}

class ServiceManager {
    private windowManager: IWindowManager;
    private serviceMap = new Map<ServiceName, IServiceData>();


    private addService(serviceName: ServiceName) {
        console.log(serviceName)
        const instance = new ServiceInstance(serviceName, serviceName);
        this.serviceMap.set(serviceName, { instance, host: null });
        instance.onHostChange((host) => {
            const mainWindow = this.windowManager?.mainWindow;
            if (mainWindow) {
                mainWindow.webContents.send("@shared/service-manager/host-changed", serviceName, host);
            }
            this.serviceMap.get(serviceName).host = host;
        });

        return instance;
    }

    startService(serviceName: ServiceName) {
        this.serviceMap.get(serviceName)?.instance?.start?.();
    }

    stopService(serviceName: ServiceName) {
        this.serviceMap.get(serviceName)?.instance?.stop?.();
    }

    setup(windowManager: IWindowManager) {
        this.windowManager = windowManager;
        // put services here
        this.addService(ServiceName.RequestForwarder).start();

        ipcMain.handle("@shared/service-manager/get-service-hosts", () => {
            const serviceHosts: Record<string, string> = {};
            this.serviceMap.forEach((val, key) => {
                if (val.host) {
                    serviceHosts[key] = val.host;
                }
            })
            return serviceHosts;
        });


    }
}

// ygd add 自定义server
const cmdHandler = (data: any) => {

    const { cmd, args } = data;
    //console.log(cmd)
    let return_code = {
        rtn_code: '000000',
        rtn_msg: 'args success',
        return_data: ''
    }
    if (cmd === "skip-next") {
        //   mainWindow.webContents.send('remote-cmd', { cmd: 'skip-next' })
        //trackPlayer.skipToNext();
        messageBus.sendCommand("SkipToNext")
    } else if (cmd === "skip-prev") {
        messageBus.sendCommand("SkipToPrevious")
        //   mainWindow.webContents.send('remote-cmd', { cmd: 'skip-prev' })
    } else if (cmd === "set-repeat-mode") {
        switch (args) {
            case 0:
                messageBus.sendCommand("SetRepeatMode", RepeatMode.Shuffle)
                break;
            case 1:
                messageBus.sendCommand("SetRepeatMode", RepeatMode.Queue)
                break;
            case 2:
                messageBus.sendCommand("SetRepeatMode", RepeatMode.Loop)
                break;
            default:
                break;
        }

        //trackPlayer.setRepeatMode(payload as RepeatMode);
        //   mainWindow.webContents.send('remote-cmd', { cmd: 'set-repeat-mode' })
    } else if (cmd === "set-player-state") {
        messageBus.sendCommand("TogglePlayerState");
        //   mainWindow.webContents.send('remote-cmd', { cmd: 'set-player-state' })
    } else if (cmd === 'set-audio-device') {
        messageBus.sendCommand("setAudioDevice", args);
        // console.log(args)
        //   mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
    } else if (cmd === 'get-current-music') {
        // console.log(messageBus.getAppState())
        //console.trace(currentMusicInfoStore.getValue().currentMusic)
        return_code.return_data = JSON.stringify(messageBus.getAppState())
    } else if (cmd === 'get-playlist') {
        return_code.return_data = JSON.stringify(messageBus.getPlayList())
    } else if (cmd == 'get-player-state') {
        //console.trace(currentMusicInfoStore.getValue().playerState)
    } else if (cmd === 'set-play-index') {
        //console.trace(args)
        //   mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
    } else if (cmd === 'get-sheets') {
        //console.log(messageBus.getMusicSheets())
        return_code.return_data = JSON.stringify(messageBus.getMusicSheets())
        //console.trace(currentMusicInfoStore.getValue().musicSheets)
    } else if (cmd === 'set-music-sheets') {
        messageBus.sendCommand("setMusicSheets", args)
        //   mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
    } else if (cmd === 'search-music') {
        messageBus.sendCommand('searchMusic', args)
        console.log("=======searchMusic")

        //   mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
    } else if (cmd === 'get-search-result') {
        console.log("=======get-search-result'")
        console.log(messageBus.getSearchResult())
        return_code.return_data = JSON.stringify(messageBus.getSearchResult())
        //console.trace(currentMusicInfoStore.getValue().searchResult)
        //return_code.return_data = JSON.stringify(currentMusicInfoStore.getValue().searchResult)
        //console.log("++++++++++++++++++++")
    } else if (cmd === 'set-play-music') {
        console.log("set-play-music")
        messageBus.sendCommand("PlayMusic", args)
        //   mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
    } else if (cmd === 'set-volume') {
        messageBus.sendCommand("setVolume", args)
        //   mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
    } else if (cmd === 'set-seek-to') {
        messageBus.sendCommand("setSeekTo", args)
        //   mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
    } else if (cmd === 'get-current-time') {
        //return_code.return_data = JSON.stringify(currentMusicInfoStore.getValue().currentTime)
    } else if (cmd === 'get-audio-devices') {
        return_code.return_data = JSON.stringify(messageBus.getAudioDevices())
        //console.log(currentMusicInfoStore.getValue().audioDevice)
        // mainWindow.webContents.send('remote-cmd', { cmd: cmd, args: args })
        //return_code.return_data = JSON.stringify(currentMusicInfoStore.getValue().audioDevice)
    } else if (cmd === 'get-volume') {
        console.log(messageBus.getVolume())
        return_code.return_data = JSON.stringify(messageBus.getVolume())
    }
    return return_code
};





const startServer = async () => {
    const server = http.createServer((req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', 'http://192.168.0.100:8123');
        // 如果需要带有凭据的请求，需要设置Access-Control-Allow-Credentials
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        // 允许的方法
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        // 允许的头部字段
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // 对于OPTIONS请求直接返回
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            return res.end();
        }
        if (req.method === 'POST' && req.headers['content-type'] === 'application/json') {
            let body = '';

            // 监听data事件以接收请求体数据
            req.on('data', (chunk: any) => {
                body += chunk.toString(); // 将Buffer数据转换为字符串
                // 如果需要处理gzip压缩的数据，可以在这里添加相应的逻辑
            });

            // 监听end事件以表示请求体已接收完毕
            req.on('end', () => {
                try {
                    // 解析JSON数据
                    const data = JSON.parse(body);

                    // 在这里处理你的JSON数据...
                    let return_code = cmdHandler(data)

                    // 发送响应
                    // 设置CORS头部

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(return_code));
                } catch (err) {
                    // 处理解析错误
                    console.error('Error parsing JSON:', err);
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Bad Request: Invalid JSON data');
                }
            });
        } else {
            // 处理其他类型的请求或方法...
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.end('Method Not Allowed');
        }
    });

    const PORT = 3001
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}


// add end

export default new ServiceManager();
