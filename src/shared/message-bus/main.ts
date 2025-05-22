import { IAppState, ICommand } from "@shared/message-bus/type";
import { IWindowManager } from "@/types/main/window-manager";
import { BrowserWindow, ipcMain, MessageChannelMain } from "electron";
import { PlayerState, RepeatMode } from "@/common/constant";
import EventEmitter from "eventemitter3";
/**
 * 消息总线
 * 包括应用状态、指令的同步
 */
class MessageBus {

    private windowManager: IWindowManager;
    private extensionWindowIds = new Set<number>();
    private appState: IAppState = {
        musicItem: null,
        playerState: PlayerState.None,
        repeatMode: RepeatMode.Loop,
        lyricText: null,
        //ygd add fullLyric duration addcurrentTime progress
        fullLyric: null,
        duration: null,
        currentTime: null,
        progress: null,
    };
    // ygd add playList同步
    private playList: IMusic.IMusicItem[] = [];
    private musicSheets: IMusic.IDBMusicSheetItem[] = [];
    private audioDevices: any[] = [];
    private searchResult: IMusic.IMusicItem[] = [];
    private volume: number = 1
    private ee = new EventEmitter<{
        stateChanged: [IAppState, IAppState]
    }>();

    public setup(windowManager: IWindowManager) {
        this.windowManager = windowManager;

        // 配置现有窗口
        const extensionWindows = this.windowManager.getExtensionWindows();
        for (const bWindow of extensionWindows) {
            this.createPortForExtensionWindow(bWindow);
        }
        windowManager.on("WindowCreated", (data) => {
            if (data.windowName !== "main") {
                this.createPortForExtensionWindow(data.browserWindow);
            }
        })

        ipcMain.on("@shared/message-bus/sync-app-state", (_, data: IAppState) => {
            // ygd add 监听appstate状态变化
            // console.trace(data)
            this.appState = {
                ...this.appState,
                ...data
            };
            this.ee.emit("stateChanged", this.appState, data);
        })

        ipcMain.on("@shared/message-bus/sync-play-list", (_, playList: IMusic.IMusicItem[]) => {
            // ygd add 监听playList状态变化 同步到main端
            // console.trace(data)
            this.playList = playList
            // console.log(this.playList)
            // this.ee.emit("stateChanged", this.appState, playList);
        })

        ipcMain.on("@shared/message-bus/sync-music-sheets", (_, musicSheets: IMusic.IDBMusicSheetItem[]) => {
            // ygd add 监听musicsheets状态变化 同步到main端
            // console.trace(data)
            this.musicSheets = musicSheets
            //console.log(this.musicSheets)
            // this.ee.emit("stateChanged", this.appState, playList);
        })

        ipcMain.on("@shared/message-bus/sync-audio-devices", (_, audioDevices: any[]) => {
            // ygd add 监听audio devices状态变化 同步到main端
            // console.trace(data)
            this.audioDevices = audioDevices
            //console.log(this.musicSheets)
            // this.ee.emit("stateChanged", this.appState, playList);
        })

        ipcMain.on("@shared/message-bus/sync-volume", (_, volume: number) => {
            // ygd add 监听volume状态变化 同步到main端
            // console.trace(data)
            this.volume = volume
            //console.log(this.musicSheets)
            // this.ee.emit("stateChanged", this.appState, playList);
        })


        ipcMain.on("@shared/message-bus/sync-search-result", (_, searchResult: IMusic.IMusicItem[]) => {
            // ygd add 监听volume状态变化 同步到main端
            // console.trace(data)
            this.searchResult = searchResult
            //console.log(this.musicSheets)
            // this.ee.emit("stateChanged", this.appState, playList);
        })
    }

    public onAppStateChange(cb: (state: IAppState, changedAppState: IAppState) => void) {
        this.ee.on("stateChanged", cb);
    }

    /**
     * 发送指令
     * @param command 指令
     * @param data 数据
     */
    public sendCommand<T extends keyof ICommand>(command: T, data?: ICommand[T]) {
        const mainWindow = this.windowManager.mainWindow;
        if (mainWindow) {
            mainWindow.webContents.send("@shared/message-bus/message", {
                type: "command",
                payload: {
                    command,
                    data
                },
                timestamp: Date.now()
            });
        }
    }

    public getAppState() {
        return this.appState;
    }
    // ygd add 主进程message bus 返回 Playlist
    public getPlayList() {
        return this.playList;
    }

    public getMusicSheets() {
        return this.musicSheets;
    }

    public getAudioDevices() {
        return this.audioDevices;
    }

    public getSearchResult() {
        return this.searchResult;
    }

    public getVolume() {
        return this.volume
    }

    // 创建通信端口
    private createPortForExtensionWindow(bWindow: BrowserWindow) {

        const mainWindow = this.windowManager.mainWindow;
        if (!mainWindow || bWindow === mainWindow) {
            return;
        }
        const { port1, port2 } = new MessageChannelMain();
        const extWindowId = bWindow.id;
        this.extensionWindowIds.add(extWindowId);

        // 通知主窗口更新
        mainWindow.webContents.postMessage("port", {
            payload: extWindowId,
            type: "mount",
            timestamp: Date.now()
        }, [port1]);

        bWindow.webContents.postMessage("port", null, [port2]);
        bWindow.on("close", () => {
            mainWindow.webContents.postMessage("port", {
                payload: extWindowId,
                type: "unmount",
                timestamp: Date.now()
            });
            this.extensionWindowIds.delete(extWindowId);
        })

    }
}


const messageBus = new MessageBus();
export default messageBus;
