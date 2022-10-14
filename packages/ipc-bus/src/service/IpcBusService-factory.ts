import type { IpcBusClient } from '../client/IpcBusClient';

import { IpcBusService, IpcBusServiceProxy } from './IpcBusService';
import { IpcBusServiceImpl } from './IpcBusServiceImpl';
import { IpcBusServiceProxyImpl } from './IpcBusServiceProxyImpl';

export const CreateIpcBusService: IpcBusService.CreateFunction = (client: IpcBusClient, serviceName: string, serviceImpl: any, options?: IpcBusService.CreateOptions): IpcBusService => {
    return new IpcBusServiceImpl(client, serviceName, serviceImpl);
};

IpcBusService.Create = CreateIpcBusService;

export const CreateIpcBusServiceProxy: IpcBusServiceProxy.CreateFunction = (client: IpcBusClient, serviceName: string, options?: IpcBusServiceProxy.CreateOptions): IpcBusServiceProxy => {
    return new IpcBusServiceProxyImpl(client, serviceName, options);
};

IpcBusServiceProxy.Create = CreateIpcBusServiceProxy;
