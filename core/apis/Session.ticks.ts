import { DomActionType } from '@ulixee/hero-interfaces/IDomChangeEvent';
import CommandTimeline from '@ulixee/hero-timetravel/lib/CommandTimeline';
import DomChangesTable, {
  IDocument,
  IDomChangeRecord,
  IPaintEvent,
} from '../models/DomChangesTable';
import { loadCommandTimeline } from './Session.commands';
import sessionDomChangesApi from './Session.domChanges';
import sessionInteractionsApi, { ISessionInteractionsResult } from './Session.interactions';
import SessionDb from '../dbs/SessionDb';
import { IMouseEventRecord } from '../models/MouseEventsTable';
import { IFocusRecord } from '../models/FocusEventsTable';
import { IScrollRecord } from '../models/ScrollEventsTable';
import ICommandWithResult from '../interfaces/ICommandWithResult';
import ICoreApi from '../interfaces/ICoreApi';
import sessionTabsApi, { ISessionTab } from './Session.tabs';
import { ISessionRecord } from '../models/SessionTable';
import CommandFormatter from '../lib/CommandFormatter';

export default function sessionTicksApi(args: ISessionTicksArgs): ISessionTicksResult {
  const sessionDb = SessionDb.getCached(args.sessionId, true);
  const session = sessionDb.session.get();
  const timeline = loadCommandTimeline(args);
  const commands = timeline.commands.map(CommandFormatter.parseResult);
  const { domChangesByTabId } = sessionDomChangesApi(args);
  const interactions = sessionInteractionsApi(args);
  const { tabs } = sessionTabsApi(args);
  const state = createSessionState(session, tabs, timeline);

  createCommandTicks(state, commands);
  createInteractionTicks(state, interactions);
  createPaintTicks(state, domChangesByTabId);
  copyDetachedPaintEvents(state, commands);

  // now sort all ticks and assign events
  sortTicks(state);

  const tabDetails = Object.values(state.tabsById);
  for (const tab of tabDetails) {
    if (!args.includeInteractionEvents) {
      delete tab.scroll;
      delete tab.focus;
      delete tab.mouse;
    }
    if (!args.includeCommands) {
      delete tab.commands;
    }
    if (!args.includePaintEvents) {
      delete tab.paintEvents;
    }
  }

  return { tabDetails };
}

/////// HELPER FUNCTIONS  //////////////////////////////////////////////////////////////////////////////////////////////

function createSessionState(
  session: ISessionRecord,
  tabs: ISessionTab[],
  timeline: CommandTimeline,
): ISessionState {
  const state: ISessionState = {
    tabsById: {},
    timeline,
  };

  for (const tab of tabs) {
    state.tabsById[tab.id] = {
      tab,
      ticks: [],
      documents: [],
      mouse: [],
      focus: [],
      scroll: [],
      commands: [],
      paintEvents: [],
    };
  }
  return state;
}

function createCommandTicks(state: ISessionState, commands: ICommandWithResult[]): void {
  for (let i = 0; i < commands.length; i += 1) {
    const command = commands[i];
    const tabId = command.tabId ?? Number(Object.keys(state.tabsById)[0]);

    addTick(state, 'command', i, {
      timestamp: command.startTime,
      commandId: command.id,
      label: command.label,
      tabId,
    });

    const tabDetails = state.tabsById[tabId];
    tabDetails.commands.push(command);
  }
}

function createInteractionTicks(
  state: ISessionState,
  interactions: ISessionInteractionsResult,
): void {
  for (const type of ['mouse', 'focus', 'scroll']) {
    const events = interactions[type];
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      addTick(state, type as any, i, event);

      const { tabId } = event;
      const tabEvents = state.tabsById[tabId][type];
      tabEvents.push(event);
    }
  }
}

function createPaintTicks(
  state: ISessionState,
  domChangesByTabId: { [tabId: number]: IDomChangeRecord[] },
): void {
  for (const [tabId, changes] of Object.entries(domChangesByTabId)) {
    const details = state.tabsById[tabId] as ITabDetails;
    const { documents, tab } = details;
    const mainFrameIds = new Set(tab.frames.filter(x => x.isMainFrame).map(x => x.id));

    const toPaint = DomChangesTable.toDomRecording(changes, mainFrameIds);
    documents.push(...toPaint.documents);

    let idx = 0;
    for (const event of toPaint.paintEvents) {
      const tick = addTick(state, 'paint', idx, { tabId: Number(tabId), ...event });
      const { action, frameId, textContent } = event.changeEvents[0];

      details.paintEvents.push(event);

      const isMainframe = mainFrameIds.has(frameId);
      if (isMainframe && action === DomActionType.newDocument) {
        tick.isNewDocumentTick = true;
        tick.documentUrl = textContent;
      }
      idx += 1;
    }
  }
}

function copyDetachedPaintEvents(state: ISessionState, commands: ICommandWithResult[]): void {
  for (const command of commands) {
    if (command.name !== 'detachTab' || command.resultType !== 'Object') continue;

    const { result } = command;
    if (!result) continue;

    let parsedResult = result;
    if (typeof result === 'string') {
      parsedResult = JSON.parse(result);
    }

    const { id, parentTabId } = parsedResult.detachedTab;
    const { domChangeRange, url } = parsedResult.detachedState;

    const parentTabDetails = state.tabsById[parentTabId];
    const tabDetails = state.tabsById[id];

    const [startTimestamp, endTimestamp] = domChangeRange.timestampRange;
    const [startIndex, endIndex] = domChangeRange.indexRange;

    const paintTick: ITick = {
      eventType: 'paint',
      eventTypeIndex: 0,
      commandId: -1,
      timestamp: tabDetails.tab.createdTime + 1,
      isMajor: false,
      timelineOffsetPercent: 1,
      isNewDocumentTick: true,
      paintEventIndex: 0,
      documentUrl: url,
      documentLoadPaintIndex: 0,
    };

    tabDetails.ticks.unshift(paintTick);

    const consolidatedPaintEvent: IPaintEvent = {
      changeEvents: [],
      commandId: command.id,
      timestamp: paintTick.timestamp,
    };
    tabDetails.paintEvents.push(consolidatedPaintEvent);

    const frameIds = new Set<number>();
    for (const paintEvent of parentTabDetails.paintEvents) {
      const { timestamp } = paintEvent;
      if (timestamp > endTimestamp) break;
      if (timestamp < startTimestamp) continue;

      for (const change of paintEvent.changeEvents) {
        let includeChange = true;

        if (timestamp === startTimestamp && change.eventIndex < startIndex) {
          includeChange = false;
        }

        if (timestamp === endTimestamp && change.eventIndex > endIndex) {
          includeChange = false;
        }

        if (includeChange) {
          frameIds.add(change.frameId);
          consolidatedPaintEvent.changeEvents.push(change);
        }
      }
    }
    const documents = parentTabDetails.documents.filter(x => frameIds.has(x.frameId));
    tabDetails.documents.push(...documents);
  }
}

function sortTicks(state: ISessionState): void {
  for (const tabDetails of Object.values(state.tabsById)) {
    const { focus, mouse, commands, tab } = tabDetails;
    const startUrl = tab.startUrl;

    let lastEvents: Pick<
      ITick,
      | 'paintEventIndex'
      | 'scrollEventIndex'
      | 'mouseEventIndex'
      | 'focusEventIndex'
      | 'highlightNodeIds'
      | 'documentUrl'
      | 'documentLoadPaintIndex'
    > = {
      documentLoadPaintIndex: undefined,
      documentUrl: startUrl,
    };
    const commandHighlightsById = new Map<number, ICommandWithResult>();
    for (const command of commands) {
      if (command.resultNodeIds) {
        commandHighlightsById.set(command.id, command);
      }
    }

    tabDetails.ticks = tabDetails.ticks.filter(tick => {
      tick.timelineOffsetPercent ??= state.timeline.getTimelineOffsetForTimestamp(tick.timestamp);
      return tick.timelineOffsetPercent <= 100 && tick.timelineOffsetPercent >= 0;
    });
    tabDetails.ticks.sort((a, b) => {
      if (a.timelineOffsetPercent === b.timelineOffsetPercent) {
        if (a.eventType === b.eventType) return a.eventTypeIndex - b.eventTypeIndex;
        return a.eventType.localeCompare(b.eventType);
      }
      return a.timelineOffsetPercent - b.timelineOffsetPercent;
    });

    for (const tick of tabDetails.ticks) {
      // if new doc, reset the markers
      if (tick.isNewDocumentTick) {
        lastEvents = {
          paintEventIndex: tick.eventTypeIndex,
          scrollEventIndex: undefined,
          mouseEventIndex: undefined,
          focusEventIndex: undefined,
          documentLoadPaintIndex: tick.eventTypeIndex,
          documentUrl: tick.documentUrl,
          highlightNodeIds: undefined,
        };
      }
      switch (tick.eventType) {
        case 'command':
          const command = commandHighlightsById.get(tick.commandId);
          if (command) {
            lastEvents.highlightNodeIds = {
              nodeIds: command.resultNodeIds,
              frameId: command.frameId,
            };
          }
          break;
        case 'focus':
          lastEvents.focusEventIndex = tick.eventTypeIndex;
          const focusEvent = focus[tick.eventTypeIndex];
          if (focusEvent.event === 0 && focusEvent.targetNodeId) {
            lastEvents.highlightNodeIds = {
              nodeIds: [focusEvent.targetNodeId],
              frameId: focusEvent.frameId,
            };
          } else if (focusEvent.event === 1) {
            lastEvents.highlightNodeIds = undefined;
          }

          break;
        case 'paint':
          lastEvents.paintEventIndex = tick.eventTypeIndex;
          break;
        case 'scroll':
          lastEvents.scrollEventIndex = tick.eventTypeIndex;
          break;
        case 'mouse':
          lastEvents.mouseEventIndex = tick.eventTypeIndex;
          const mouseEvent = mouse[tick.eventTypeIndex];
          if (mouseEvent.event === 1 && mouseEvent.targetNodeId) {
            lastEvents.highlightNodeIds = {
              nodeIds: [mouseEvent.targetNodeId],
              frameId: mouseEvent.frameId,
            };
          } else if (mouseEvent.event === 2) {
            lastEvents.highlightNodeIds = undefined;
          }
          break;
      }

      Object.assign(tick, lastEvents);
      if (tick.eventType === 'init' || lastEvents.paintEventIndex === undefined) {
        tick.documentLoadPaintIndex = -1;
        tick.documentUrl = tab.startUrl;
        tick.paintEventIndex = -1;
      }
    }
  }
}

function addTick(
  state: ISessionState,
  eventType: ITick['eventType'],
  eventTypeIndex: number,
  tick: { commandId?: number; timestamp: number; label?: string; tabId: number },
): ITick {
  const { commandId, timestamp, label, tabId } = tick;

  const newTick = {
    eventType,
    eventTypeIndex,
    commandId,
    timestamp,
    label,
    isMajor: eventType === 'command',
  } as ITick;

  const tabDetails = tabId ? state.tabsById[tabId] : Object.values(state.tabsById)[0];
  tabDetails.ticks.push(newTick);
  return newTick;
}

export interface ISessionTicksApi extends ICoreApi {
  args: ISessionTicksArgs;
  result: ISessionTicksResult;
}

export interface ISessionTicksArgs {
  sessionId: string;
  includeInteractionEvents?: boolean;
  includeCommands?: boolean;
  includePaintEvents?: boolean;
}

export interface ISessionTicksResult {
  tabDetails: ITabDetails[];
}

export interface ITabDetails {
  tab: ISessionTab;
  ticks: ITick[];
  mouse?: IMouseEventRecord[];
  focus?: IFocusRecord[];
  scroll?: IScrollRecord[];
  commands?: ICommandWithResult[];
  paintEvents?: IPaintEvent[];
  documents: IDocument[];
}

export interface ITick {
  eventType: 'command' | 'paint' | 'focus' | 'mouse' | 'scroll' | 'init';
  eventTypeIndex: number;
  commandId: number;
  timestamp: number;
  timelineOffsetPercent: number;
  isMajor: boolean;
  label?: string;
  isNewDocumentTick: boolean;
  documentUrl: string;
  documentLoadPaintIndex: number;
  highlightNodeIds?: { frameId: number; nodeIds: number[] };
  paintEventIndex?: number;
  scrollEventIndex?: number;
  focusEventIndex?: number;
  mouseEventIndex?: number;
}

interface ISessionState {
  tabsById: { [tabId: number]: ITabDetails };
  timeline: CommandTimeline;
}
