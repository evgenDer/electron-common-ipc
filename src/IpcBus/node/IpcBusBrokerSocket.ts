import { JSONParserV1 } from 'json-helpers';
import type * as net from 'net';

import { IpcPacketBufferList, BufferListReader } from 'socket-serializer';
import type { IpcBusCommand } from '../IpcBusCommand';

import * as IpcBusUtils from '../IpcBusUtils';

export interface IpcBusBrokerSocketClient {
    onSocketData(socket: net.Socket, ipcCommand: IpcBusCommand, ipcPacketBufferList: IpcPacketBufferList): void;
    onSocketError(socket: net.Socket, err: string): void;
    onSocketClose(socket: net.Socket): void;
    onSocketEnd(socket: net.Socket): void;
};

export class IpcBusBrokerSocket {
    private _socket: net.Socket;
    protected _socketBinds: { [key: string]: (...args: any[]) => void };

    private _packetIn: IpcPacketBufferList;
    private _bufferListReader: BufferListReader;
    private _client: IpcBusBrokerSocketClient;

    constructor(socket: net.Socket, client: IpcBusBrokerSocketClient) {
        this._socket = socket;
        this._client = client;

        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:BrokerSocket] Connect: ${this._socket.remotePort}`);

        this._bufferListReader = new BufferListReader();
        this._packetIn = new IpcPacketBufferList();
        this._packetIn.JSON = JSONParserV1;

        this._socketBinds = {};
        this._socketBinds['error'] = this._onSocketError.bind(this);
        this._socketBinds['close'] = this._onSocketClose.bind(this);
        this._socketBinds['data'] = this._onSocketData.bind(this);
        this._socketBinds['end'] = this._onSocketEnd.bind(this);

        for (let key in this._socketBinds) {
            this._socket.addListener(key, this._socketBinds[key]);
        }
    }

    get socket(): net.Socket {
        return this._socket;
    }

    release(closeServer: boolean) {
        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:BrokerSocket] Release: ${this._socket.remotePort}`);
        if (this._socket) {
            const socket = this._socket;
            if (closeServer) {
                this._client = null;
                const key = 'data';
                socket.removeListener(key, this._socketBinds[key]);
            }
            else {
                for (let key in this._socketBinds) {
                    socket.removeListener(key, this._socketBinds[key]);
                }
                this._socket = null;
            }
            socket.end();
            socket.unref();
            // this._socket.destroy();
        }
    }

    protected _onSocketData(buffer: Buffer) {
        this._bufferListReader.appendBuffer(buffer);
        if (this._packetIn.decodeFromReader(this._bufferListReader)) {
            do {
                const ipcCommand: IpcBusCommand = this._packetIn.parseArrayAt(0);
                this._client.onSocketData(this._socket, ipcCommand, this._packetIn);
            } while (this._packetIn.decodeFromReader(this._bufferListReader));
            // Remove read buffer
            this._bufferListReader.reduce();
        }
    }

    protected _onSocketError(err: any) {
        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Broker] Error on connection: ${this._socket.remotePort} - ${err}`);
        this._client && this._client.onSocketError(this._socket, err);
        // this.release();
    }

    protected _onSocketClose() {
        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Broker] Close on connection: ${this._socket.remotePort}`);
        this._client && this._client.onSocketClose(this._socket);
        this.release(false);
    }

    protected _onSocketEnd() {
        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Broker] End on connection: ${this._socket.remotePort}`);
        this._client && this._client.onSocketEnd(this._socket);
        // this.release();
    }
}
