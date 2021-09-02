// import * as uuid from 'uuid';
import { JSONParserV1 } from 'json-helpers';
import * as shortid from 'shortid';
import { IpcPacketBuffer } from 'socket-serializer';

import type { IpcConnectOptions, IpcBusPeer, IpcBusPeerProcess } from './IpcBusClient';
import type { IpcBusMessage, IpcBusTarget } from './IpcBusCommand';

export const IPC_BUS_TIMEOUT = 2000;// 20000;

const win32prefix1 = '\\\\.\\pipe';
const win32prefix2 = '\\\\?\\pipe';


export type Arr = readonly unknown[];
export function partialCall<T extends Arr, U extends Arr, R>(f: (...args: [...T, ...U]) => R, ...headArgs: T) {
    return (...tailArgs: U) => f(...headArgs, ...tailArgs)
}

// https://nodejs.org/api/net.html#net_ipc_support
function CleanPipeName(str: string) {
    if (process.platform === 'win32') {
        if ((str.lastIndexOf(win32prefix1, 0) === -1) && (str.lastIndexOf(win32prefix2, 0) === -1)) {
            str = str.replace(/^\//, '');
            str = str.replace(/\//g, '-');
            str = win32prefix1 + '\\' + str;
        }
    }
    return str;
}

const TargetSignature = `_target_`;
const TargetMainSignature     = `${TargetSignature}main_`;
const TargetProcessSignature  = `${TargetSignature}proc_`;
const TargetRendererSignature = `${TargetSignature}rend_`;

const TargetSignatureLength = TargetMainSignature.length;

const TargetSignatures: any = {
    'node': TargetProcessSignature,
    'native': TargetProcessSignature,
    'renderer': TargetRendererSignature,
    'main': TargetMainSignature
};

function _GetTargetFromChannel(targetTypeSignature: string, ipcMessage: IpcBusMessage): IpcBusTarget | null {
    if (ipcMessage.channel && (ipcMessage.channel.lastIndexOf(TargetSignature, 0) === 0)) {
        if (ipcMessage.channel.lastIndexOf(targetTypeSignature, 0) !== 0) {
            return null;
        }
        const index = ipcMessage.channel.indexOf(TargetSignature, TargetSignatureLength);
        return JSON.parse(ipcMessage.channel.substr(TargetSignatureLength, index - TargetSignatureLength));
    }
    return null;
}

export function GetTargetMain(ipcMessage: IpcBusMessage, checkChannel: boolean = false): IpcBusTarget | null {
    if (ipcMessage.target) {
        return (ipcMessage.target.process.type === 'main') ? ipcMessage.target : null;
    }
    if (checkChannel) {
        return _GetTargetFromChannel(TargetMainSignature, ipcMessage);
    }
    return null;
}

export function GetTargetProcess(ipcMessage: IpcBusMessage, checkChannel: boolean = false): IpcBusTarget | null {
    if (ipcMessage.target) {
        return ((ipcMessage.target.process.type === 'node') || (ipcMessage.target.process.type === 'native')) ? ipcMessage.target : null;
    }
    if (checkChannel) {
        return _GetTargetFromChannel(TargetProcessSignature, ipcMessage);
    }
    return null;
}

export function GetTargetRenderer(ipcMessage: IpcBusMessage, checkChannel: boolean = false): IpcBusTarget | null {
    if (ipcMessage.target) {
        return (ipcMessage.target.process.type === 'renderer') ? ipcMessage.target : null;
    }
    if (checkChannel) {
        return _GetTargetFromChannel(TargetRendererSignature, ipcMessage);
    }
    return null;
}

export function CreateKeyForEndpoint(endpoint: IpcBusPeer | IpcBusPeerProcess): number {
    if (endpoint.process.wcid && endpoint.process.frameid) {
        return (endpoint.process.wcid << 8) + endpoint.process.frameid;
    }
    else {
        return endpoint.process.pid;
    }
}

export function CreateTargetChannel(peer: IpcBusPeer): string {
    const target = CreateMessageTarget(peer);
    const targetTypeSignature = TargetSignatures[peer.process.type] || `_no_target_`;
    return `${targetTypeSignature}${JSON.stringify(target)}${TargetSignature}${CreateUniqId()}`;
}

export function CreateMessageTarget(target: IpcBusPeer | IpcBusPeerProcess | undefined): IpcBusTarget {
    if (target == null) {
        return undefined;
    }
    const messageTarget: IpcBusTarget = { process: target.process };
    if ((target as any).id) {
        const peer = target as IpcBusPeer;
        messageTarget.peerid = peer.id;
    }
    return messageTarget;
}

export function CheckChannel(channel: any): string {
    switch (typeof channel) {
        case 'string':
            break;
        case 'undefined':
            channel = 'undefined';
            break;
        default:
            if (channel === null) {
                channel = 'null';
            }
            else {
                channel = channel.toString();
            }
            break;
    }
    return channel;
}

export function checkTimeout(val: any): number {
    const parseVal = parseFloat(val);
    if (parseVal == val) {
        return parseVal;
    }
    else {
        return IPC_BUS_TIMEOUT;
    }
}

export function CheckConnectOptions<T extends IpcConnectOptions>(arg1: T | string | number, arg2?: T | string, arg3?: T): T | null {
    // A port number : 59233, 42153
    // A port number + hostname : 59233, '127.0.0.1'
    const options: T = (typeof arg1 === 'object' ? arg1 : typeof arg2 === 'object' ? arg2 : typeof arg3 === 'object' ? arg3 : {}) as T;
    if (Number(arg1) >= 0) {
        options.port = Number(arg1);
        options.host = typeof arg2 === 'string' ? arg2 : undefined;
    }
    // A 'hostname:port' pattern : 'localhost:8082'
    // A path : '//local-ipc'
    else if (typeof arg1 === 'string') {
        const parts = arg1.split(':');
        if ((parts.length === 2) && (Number(parts[1]) >= 0)) {
            options.port = Number(parts[1]);
            options.host = parts[0];
        }
        else {
            options.path = arg1;
        }
    }
    // An IpcNetOptions object similar to NodeJS.net.ListenOptions
    if (options.path) {
        options.path = CleanPipeName(options.path);
    }
    if (options.timeoutDelay == null) {
        options.timeoutDelay = IPC_BUS_TIMEOUT;
    }
    return options;
}

// let uniqNumber = 0;
// const padding = '0000000000'
// const paddingLength = padding.length;
// export function CreateUniqId(): string {
//     // ++uniqNumber;
//     // return (padding + uniqNumber.toString()).substr(-paddingLength);
//     // return uuid.v1();
//     return shortid.generate();
// }
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#&')
export function CreateUniqId(): string {
    return shortid.generate();
}

export function BinarySearch<T>(array: T[], target: T, compareFn: (l: T, r: T) => number) {
    let left = 0;  // inclusive
    let right = array.length;  // exclusive
    while (left < right) {
        let middle = (left + right) >> 1;
        const compareResult = compareFn(target, array[middle]);
        if (compareResult > 0) {
            left = middle + 1;
        }
        else if (compareResult < 0) {
            right = middle;
        }
        else {
            return middle;
        }
    }
    // left is the insertion point if not found
    return -left - 1;
};


/** @internal */
export class Logger {
    static enable: boolean = false;
    static service: boolean = false;
    // static logFile: string;

    static info(msg: string) {
        console.log(msg);
    }

    static warn(msg: string) {
        console.warn(msg);
    }

    static error(msg: string) {
        console.error(msg);
    }

};

export function ActivateIpcBusTrace(enable: boolean): void {
    Logger.enable = enable;
}

export function ActivateServiceTrace(enable: boolean): void {
    Logger.service = enable;
}


export class ConnectCloseState<T> {
    protected _waitForConnected: Promise<T>;
    protected _waitForClosed: Promise<void>;
    protected _connected: boolean;
    // protected _t: T | null;

    constructor() {
        this.shutdown();
    }

    get connected(): boolean {
        return this._connected;
    }

    // get value(): T {
    //     return this._t;
    // }

    connect(cb: () => Promise<T>): Promise<T> {
        if (this._waitForConnected == null) {
            this._waitForConnected = this._waitForClosed
            .then(() => {
                return cb();
            })
            .then((t) => {
                // this._t = t;
                this._connected = true;
                return t;
            })
            .catch((err) => {
                this._waitForConnected = null;
                throw err;
            });
        }
        return this._waitForConnected;
    }

    close(cb: () => Promise<void>): Promise<void> {
        if (this._waitForConnected) {
            const waitForConnected = this._waitForConnected;
            this._waitForConnected = null;
            this._waitForClosed = waitForConnected
            .then(() => {
                // this._t = null;
                this._connected = false;
                return cb();
            });
        }
        return this._waitForClosed;
    }

    shutdown() {
        this._waitForConnected = null;
        // this._t = null;
        this._waitForClosed = Promise.resolve();
        this._connected = false;
    }
}

export class SerializeMessage {
    private _packetOut: IpcPacketBuffer;

    constructor() {
        this._packetOut = new IpcPacketBuffer();
        this._packetOut.JSON = JSONParserV1;
    }

    serialize(ipcMessage: IpcBusMessage, args?: any[]): IpcPacketBuffer | null {
        // maybe an arg does not supporting Electron serialization !
        if (!ipcMessage.rawData) {
            ipcMessage.rawData = true;
            JSONParserV1.install();
            this._packetOut.serialize([ipcMessage, args]);
            JSONParserV1.uninstall();
            return this._packetOut;
        }
        return null;
    }
}