import * as assert from 'assert';
import type { EventEmitter } from 'events';

import { IpcPacketBuffer } from 'socket-serializer';
import { JSONParserV1 } from 'json-helpers';

import * as IpcBusUtils from '../IpcBusUtils';
import type * as Client from '../IpcBusClient';
import type { IpcBusCommand, IpcBusMessage } from '../IpcBusCommand';
import type { IpcBusConnector } from '../IpcBusConnector';
import { IpcBusConnectorImpl } from '../IpcBusConnectorImpl';

import { IpcBusRendererContent } from './IpcBusRendererContent';

export const IPCBUS_TRANSPORT_RENDERER_HANDSHAKE = 'ECIPC:IpcBusRenderer:Handshake';
export const IPCBUS_RENDERER_MESSAGE_RAWDATA = 'ECIPC:IpcBusRenderer:Message.RawData';
export const IPCBUS_RENDERER_MESSAGE_ARGS = 'ECIPC:IpcBusRenderer:Message.Args';
export const IPCBUS_RENDERER_COMMAND = 'ECIPC:IpcBusRenderer:Command.Args';

export interface IpcWindow extends EventEmitter {
    send(channel: string, ...args: any[]): void;
    sendTo(webContentsId: number, channel: string, ...args: any[]): void;
    postMessage(channel: string, message: any, transfer?: MessagePort[]): void;
}

// Implementation for renderer process
/** @internal */
export class IpcBusConnectorRenderer extends IpcBusConnectorImpl {
    private _ipcWindow: IpcWindow;
    private _onIpcEventRawDataReceived: (...args: any[]) => void;
    private _onIpcEventArgsReceived: (...args: any[]) => void;
    private _useElectronSerialization: boolean;
    // private _useIPCFrameAPI: boolean;
    private _packetOut: IpcPacketBuffer;

    constructor(contextType: Client.IpcBusProcessType, isMainFrame: boolean, ipcWindow: IpcWindow) {
        assert(contextType === 'renderer', `IpcBusTransportWindow: contextType must not be a ${contextType}`);
        super(contextType);
        this._ipcWindow = ipcWindow;
        this._peerProcess.process.isMainFrame = isMainFrame;
        this._packetOut = new IpcPacketBuffer();
        this._packetOut.JSON = JSONParserV1;

        // WE MUST NOT CLEAN-UP IPC ON THIS EVENT AS SOME APPS ARE STILL SENDING MESSAGES AT THIS STAGE.
        // window.addEventListener('beforeunload', (event: BeforeUnloadEvent) => {
            // console.log(`IPCBUS-'beforeunload'`);
            // this.onConnectorBeforeShutdown();
            // this.onConnectorShutdown();
        // });
        // window.addEventListener('pagehide', (event: PageTransitionEvent) => {
        //     // console.log(`IPCBUS-'pagehide'`);
        //     if (event.persisted) {
        //     }
        //     else {
        //         // this.onConnectorBeforeShutdown();
        //         // this.onConnectorShutdown();
        //     }
        // });
        // window.addEventListener('unload', (event: BeforeUnloadEvent) => {
            // console.log(`IPCBUS-'unload'`);
            // setTimeout(() => {
            //     this.onConnectorBeforeShutdown();
            //     this.onConnectorShutdown();
            // }, 1);
        // });
    }

    isTarget(ipcMessage: IpcBusMessage): boolean {
        const target = IpcBusUtils.GetTargetRenderer(ipcMessage);
        return (target
                && (target.process.wcid == this._peerProcess.process.wcid)
                && (target.process.frameid == this._peerProcess.process.frameid));
    }

    protected onConnectorBeforeShutdown() {
        super.onConnectorBeforeShutdown();
        if (this._onIpcEventRawDataReceived) {
            this._ipcWindow.removeListener(IPCBUS_RENDERER_MESSAGE_RAWDATA, this._onIpcEventRawDataReceived);
            this._ipcWindow.removeListener(IPCBUS_RENDERER_MESSAGE_ARGS, this._onIpcEventArgsReceived);
            this._onIpcEventRawDataReceived = null;
            this._onIpcEventArgsReceived = null;
        }
    }

    protected _onConnect(eventOrHanshake: any | IpcBusConnector.Handshake, handshakeOrUndefined: IpcBusConnector.Handshake): IpcBusConnector.Handshake {
        let handshake: IpcBusConnector.Handshake;
        // In sandbox mode, 1st parameter is no more the event, but directly arguments !!!
        if (handshakeOrUndefined) {
            // IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport:Window] Sandbox off listening for #${this._messageId}`);
            handshake = handshakeOrUndefined;
            this._onIpcEventRawDataReceived = (event, ipcMessage, rawData) => {
                IpcBusRendererContent.FixRawContent(rawData);
                this._client.onConnectorRawDataReceived(ipcMessage, rawData);
            };
            this._onIpcEventArgsReceived = (event, ipcMessage, args) => {
                this._client.onConnectorArgsReceived(ipcMessage, args);
            };
        }
        else {
            handshake = eventOrHanshake as IpcBusConnector.Handshake;
            this._onIpcEventRawDataReceived = (ipcMessage, rawData) => {
                IpcBusRendererContent.FixRawContent(rawData);
                this._client.onConnectorRawDataReceived(ipcMessage, rawData);
            };
            this._onIpcEventArgsReceived = (ipcMessage, args) => {
                this._client.onConnectorArgsReceived(ipcMessage, args);
            };
        }
        // console.warn(`ElectronCommonIpc:handshake${JSON.stringify(handshake)}`);
        this._useElectronSerialization = handshake.useIPCNativeSerialization;
        // this._useIPCFrameAPI = handshake.useIPCFrameAPI;
        // Keep the this._peer.process ref intact as shared with client peers
        this._peerProcess.process = Object.assign(this._peerProcess.process, handshake.process);
        this._log.level = handshake.logLevel;
        this._ipcWindow.addListener(IPCBUS_RENDERER_MESSAGE_RAWDATA, this._onIpcEventRawDataReceived);
        this._ipcWindow.addListener(IPCBUS_RENDERER_MESSAGE_ARGS, this._onIpcEventArgsReceived);

        this.onConnectorHandshake();

        return handshake;
    };

    /// IpcBusTrandport API
    handshake(client: IpcBusConnector.Client, options: Client.IpcBusClient.ConnectOptions): Promise<IpcBusConnector.Handshake> {
        return this._connectCloseState.connect(() => {
            return new Promise<IpcBusConnector.Handshake>((resolve, reject) => {
                // Do not type timer as it may differ between node and browser api, let compiler and browserify deal with.
                let timer: NodeJS.Timer;
                const onIpcConnect = (eventOrHanshake: any | IpcBusConnector.Handshake, handshakeOrUndefined: IpcBusConnector.Handshake) => {
                    clearTimeout(timer);
                    this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                    this.addClient(client);

                    const handshake = this._onConnect(eventOrHanshake, handshakeOrUndefined);
                    resolve(handshake);
                };

                // Below zero = infinite
                options = IpcBusUtils.CheckConnectOptions(options);
                if (options.timeoutDelay >= 0) {
                    timer = setTimeout(() => {
                        timer = null;
                        this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                        reject('timeout');
                    }, options.timeoutDelay);
                }
                // We wait for the bridge confirmation
                this._ipcWindow.addListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                this._ipcWindow.send(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, this._peerProcess);
            });
        });
    }

    shutdown(options?: Client.IpcBusClient.CloseOptions): Promise<void> {
        return this._connectCloseState.close(() => {
            this.onConnectorBeforeShutdown();
            this.onConnectorShutdown();
            return Promise.resolve();
        });
    }

    postMessagePort(ipcMessage: IpcBusMessage, message: string, transfer?: MessagePort[]): void {
    }

    postMessage(ipcMessage: IpcBusMessage, args?: any[]): void {
        // ipcMessage.process = ipcMessage.process || this._process;
        const target = IpcBusUtils.GetTargetRenderer(ipcMessage, true);
        if (this._useElectronSerialization) {
            try {
                if (target && target.process.isMainFrame) {
                    this._ipcWindow.sendTo(target.process.wcid, IPCBUS_RENDERER_MESSAGE_ARGS, ipcMessage, args);
                }
                else {
                    this._ipcWindow.send(IPCBUS_RENDERER_MESSAGE_ARGS, ipcMessage, args);
                }
                return;
            }
            catch (err) {
                // maybe an arg does not supporting Electron serialization !
            }
        }
        JSONParserV1.install();
        this._packetOut.serialize([ipcMessage, args]);
        JSONParserV1.uninstall();
        const rawData = this._packetOut.getRawData();
        if (target && target.process.isMainFrame) {
            this._ipcWindow.sendTo(target.process.wcid, IPCBUS_RENDERER_MESSAGE_RAWDATA, ipcMessage, rawData);
        }
        else {
            this._ipcWindow.send(IPCBUS_RENDERER_MESSAGE_RAWDATA, ipcMessage, rawData);
        }
    }

    // We keep ipcCommand in plain text, once again to have master handling it easily
    postCommand(ipcCommand: IpcBusCommand): void {
        ipcCommand.peer = ipcCommand.peer || this._peerProcess;
        this._ipcWindow.send(IPCBUS_RENDERER_COMMAND, ipcCommand);
    }
}
