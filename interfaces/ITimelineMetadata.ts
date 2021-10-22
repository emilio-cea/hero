export default interface ITimelineMetadata {
  // don't group by tabid/frameid for now
  paintEvents: {
    offsetPercent: number;
    domChanges: number;
  }[];
  urls: {
    tabId: number;
    navigationId: number;
    url: string;
    offsetPercent: number;
    loadStatusOffsets: {
      status: string;
      offsetPercent: number;
    }[];
  }[];
  screenshots: {
    timestamp: number;
    offsetPercent: number;
    tabId: number;
  }[];
}
