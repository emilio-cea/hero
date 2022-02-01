import ISessionMeta from '@ulixee/hero-interfaces/ISessionMeta';
import { IJsPath } from 'awaited-dom/base/AwaitedPath';
import IWaitForResourceOptions from '@ulixee/hero-interfaces/IWaitForResourceOptions';
import IResourceMeta from '@ulixee/hero-interfaces/IResourceMeta';
import IUserProfile from '@ulixee/hero-interfaces/IUserProfile';
import IConfigureSessionOptions from '@ulixee/hero-interfaces/IConfigureSessionOptions';
import IWaitForOptions from '@ulixee/hero-interfaces/IWaitForOptions';
import IScreenshotOptions from '@ulixee/hero-interfaces/IScreenshotOptions';
import IFrameMeta from '@ulixee/hero-interfaces/IFrameMeta';
import IFileChooserPrompt from '@ulixee/hero-interfaces/IFileChooserPrompt';
import CoreCommandQueue from './CoreCommandQueue';
import CoreEventHeap from './CoreEventHeap';
import IWaitForResourceFilter from '../interfaces/IWaitForResourceFilter';
import { createResource } from './Resource';
import IJsPathEventTarget from '../interfaces/IJsPathEventTarget';
import ConnectionToCore from '../connections/ConnectionToCore';
import CoreFrameEnvironment from './CoreFrameEnvironment';
import { createDialog } from './Dialog';
import CoreSession from './CoreSession';
import ICommandCounter from '../interfaces/ICommandCounter';
import IFlowHandler from '../interfaces/IFlowHandler';
import DomStateHandler from './DomStateHandler';
import { CanceledPromiseError } from '@ulixee/commons/interfaces/IPendingWaitEvent';
import DomState from './DomState';
import ISourceCodeLocation from '@ulixee/commons/interfaces/ISourceCodeLocation';
import IDomState from '@ulixee/hero-interfaces/IDomState';

export default class CoreTab implements IJsPathEventTarget {
  public tabId: number;
  public sessionId: string;
  public commandQueue: CoreCommandQueue;
  public eventHeap: CoreEventHeap;
  public get mainFrameEnvironment(): CoreFrameEnvironment {
    return this.frameEnvironmentsById.get(this.mainFrameId);
  }

  public frameEnvironmentsById = new Map<number, CoreFrameEnvironment>();
  protected readonly meta: ISessionMeta & { sessionName: string };
  private readonly flowHandlers: IFlowHandler[] = [];
  private readonly connection: ConnectionToCore;
  private readonly mainFrameId: number;
  private readonly coreSession: CoreSession;

  constructor(
    meta: ISessionMeta & { sessionName: string },
    connection: ConnectionToCore,
    coreSession: CoreSession,
  ) {
    const { tabId, sessionId, frameId, sessionName } = meta;
    this.tabId = tabId;
    this.sessionId = sessionId;
    this.mainFrameId = frameId;
    this.meta = {
      sessionId,
      tabId,
      sessionName,
    };
    this.connection = connection;
    this.commandQueue = new CoreCommandQueue(
      this.meta,
      coreSession.mode,
      connection,
      coreSession as ICommandCounter,
    );
    this.commandQueue.registerCommandRetryHandlerFn(this.shouldRetryFlowHandler.bind(this));
    this.coreSession = coreSession;
    this.eventHeap = new CoreEventHeap(this.meta, connection, coreSession as ICommandCounter);
    this.frameEnvironmentsById.set(
      frameId,
      new CoreFrameEnvironment(meta, null, this.commandQueue),
    );

    const resolvedThis = Promise.resolve(this);
    this.eventHeap.registerEventInterceptors({
      resource: createResource.bind(null, resolvedThis),
      dialog: createDialog.bind(null, resolvedThis),
    });
  }

  public async registerFlowHandler(
    state: IDomState | DomState,
    handlerFn: (error?: Error) => Promise<any>,
    callSitePath: ISourceCodeLocation[],
  ): Promise<void> {
    const id = this.flowHandlers.length + 1;
    this.flowHandlers.push({ id, state, callSitePath, handlerFn });
    await this.commandQueue.runOutOfBand('Tab.registerFlowHandler', state.name, id, callSitePath);
  }

  public async shouldRetryFlowHandler(
    command: CoreCommandQueue['internalState']['lastCommand'],
    error: Error,
  ): Promise<boolean> {
    if (error instanceof CanceledPromiseError) return false;
    if (
      command.command === 'FrameEnvironment.execJsPath' ||
      command.command === 'FrameEnvironment.interact'
    ) {
      return await this.checkFlowHandlers();
    }
    return false;
  }

  public async checkFlowHandlers(): Promise<boolean> {
    const matchingStates: IFlowHandler[] = [];
    await Promise.all(
      this.flowHandlers.map(async flowHandler => {
        const handler = new DomStateHandler(flowHandler.state, this, flowHandler.callSitePath);
        try {
          if (await handler.check()) {
            matchingStates.push(flowHandler);
          }
        } catch (err) {
          await flowHandler.handlerFn(err);
        }
      }),
    );
    if (!matchingStates.length) return false;

    try {
      const flowHandler = matchingStates[0];
      this.commandQueue.setCommandMetadata({ activeFlowHandlerId: flowHandler.id });
      await flowHandler.handlerFn();
      return true;
    } finally {
      this.commandQueue.setCommandMetadata({});
    }
  }

  public async getCoreFrameEnvironments(): Promise<CoreFrameEnvironment[]> {
    const frameMetas = await this.commandQueue.run<IFrameMeta[]>('Tab.getFrameEnvironments');
    for (const frameMeta of frameMetas) {
      this.getCoreFrameForMeta(frameMeta);
    }
    return [...this.frameEnvironmentsById.values()];
  }

  public getCoreFrameForMeta(frameMeta: IFrameMeta): CoreFrameEnvironment {
    if (!this.frameEnvironmentsById.has(frameMeta.id)) {
      const meta = { ...this.meta };
      meta.frameId = frameMeta.id;
      this.frameEnvironmentsById.set(
        frameMeta.id,
        new CoreFrameEnvironment(meta, frameMeta.parentFrameId, this.commandQueue),
      );
    }
    return this.frameEnvironmentsById.get(frameMeta.id);
  }

  public async getResourceProperty<T = any>(id: number, propertyPath: string): Promise<T> {
    return await this.commandQueue.runOutOfBand('Tab.getResourceProperty', id, propertyPath);
  }

  public async configure(options: IConfigureSessionOptions): Promise<void> {
    await this.commandQueue.run('Tab.configure', options);
  }

  public async collectResource(name: string, resourceId: number): Promise<void> {
    return await this.commandQueue.run('Tab.collectResource', name, resourceId);
  }

  public async goto(href: string, options: { timeoutMs?: number }): Promise<IResourceMeta> {
    return await this.commandQueue.run('Tab.goto', href, options);
  }

  public async goBack(options: { timeoutMs?: number }): Promise<string> {
    return await this.commandQueue.run('Tab.goBack', options);
  }

  public async goForward(options: { timeoutMs?: number }): Promise<string> {
    return await this.commandQueue.run('Tab.goForward', options);
  }

  public async reload(options: { timeoutMs?: number }): Promise<IResourceMeta> {
    return await this.commandQueue.run('Tab.reload', options);
  }

  public async exportUserProfile(): Promise<IUserProfile> {
    return await this.commandQueue.run('Session.exportUserProfile');
  }

  public async takeScreenshot(options: IScreenshotOptions): Promise<Buffer> {
    return await this.commandQueue.run('Tab.takeScreenshot', options);
  }

  public async waitForFileChooser(options: IWaitForOptions): Promise<IFileChooserPrompt> {
    return await this.commandQueue.run('Tab.waitForFileChooser', options);
  }

  public async waitForResource(
    filter: Pick<IWaitForResourceFilter, 'url' | 'type'>,
    opts: IWaitForResourceOptions,
  ): Promise<IResourceMeta[]> {
    return await this.commandQueue.run('Tab.waitForResource', filter, opts);
  }

  public async waitForMillis(millis: number): Promise<void> {
    await this.commandQueue.run('Tab.waitForMillis', millis);
  }

  public async waitForNewTab(opts: IWaitForOptions): Promise<CoreTab> {
    const sessionMeta = await this.commandQueue.run<ISessionMeta>('Tab.waitForNewTab', opts);
    const session = this.connection.getSession(sessionMeta.sessionId);
    session.addTab(sessionMeta);
    return new CoreTab(
      { ...this.meta, tabId: sessionMeta.tabId },
      this.connection,
      this.coreSession,
    );
  }

  public async focusTab(): Promise<void> {
    await this.commandQueue.run('Tab.focus');
  }

  public async dismissDialog(accept: boolean, promptText?: string): Promise<void> {
    await this.commandQueue.runOutOfBand('Tab.dismissDialog', accept, promptText);
  }

  public async addEventListener(
    jsPath: IJsPath | null,
    eventType: string,
    listenerFn: (...args: any[]) => void,
    options?: any,
  ): Promise<void> {
    await this.eventHeap.addListener(jsPath, eventType, listenerFn, options);
  }

  public async removeEventListener(
    jsPath: IJsPath | null,
    eventType: string,
    listenerFn: (...args: any[]) => void,
    options?: any,
  ): Promise<void> {
    await this.eventHeap.removeListener(jsPath, eventType, listenerFn, options);
  }

  public async flush(): Promise<void> {
    for (const frame of this.frameEnvironmentsById.values()) {
      await frame.commandQueue.flush();
    }
    await this.commandQueue.flush();
  }

  public async close(): Promise<void> {
    await this.flush();
    await this.commandQueue.run('Tab.close');
    const session = this.connection.getSession(this.sessionId);
    session?.removeTab(this);
  }
}
