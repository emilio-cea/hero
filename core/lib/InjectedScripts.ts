import * as fs from 'fs';
import { IPuppetPage } from '@ulixee/hero-interfaces/IPuppetPage';
import { stringifiedTypeSerializerClass } from '@ulixee/commons/lib/TypeSerializer';

const pageScripts = {
  domStorage: fs.readFileSync(`${__dirname}/../injected-scripts/domStorage.js`, 'utf8'),
  interactReplayer: fs.readFileSync(`${__dirname}/../injected-scripts/interactReplayer.js`, 'utf8'),
  NodeTracker: fs.readFileSync(`${__dirname}/../injected-scripts/NodeTracker.js`, 'utf8'),
  jsPath: fs.readFileSync(`${__dirname}/../injected-scripts/jsPath.js`, 'utf8'),
  Fetcher: fs.readFileSync(`${__dirname}/../injected-scripts/Fetcher.js`, 'utf8'),
  MouseEvents: fs.readFileSync(`${__dirname}/../injected-scripts/MouseEvents.js`, 'utf8'),
  pageEventsRecorder: fs.readFileSync(
    `${__dirname}/../injected-scripts/pageEventsRecorder.js`,
    'utf8',
  ),
};
const pageEventsCallbackName = '__heroPageListenerCallback';

export const heroIncludes = `
const exports = {}; // workaround for ts adding an exports variable
${stringifiedTypeSerializerClass};

${pageScripts.NodeTracker};
${pageScripts.jsPath};
${pageScripts.Fetcher};

window.HERO = {
  JsPath,
  TypeSerializer,
  Fetcher,
};
`;

const injectedScript = `(function installInjectedScripts() {
    ${heroIncludes}
    ${pageScripts.MouseEvents};

    (function installDomRecorder(runtimeFunction) {
       ${pageScripts.pageEventsRecorder}
    })('${pageEventsCallbackName}');

    window.HERO.MouseEvents = MouseEvents;

    ${pageScripts.domStorage}
})();`;

const showInteractionScript = `(function installInteractionsScript() {
    const exports = {}; // workaround for ts adding an exports variable

    window.selfFrameIdPath = '';
    if (!'blockClickAndSubmit' in window) window.blockClickAndSubmit = false;

    if (!('getNodeById' in window)) {
      window.getNodeById = function getNodeById(id) {
        if (id === null || id === undefined) return null;
        return NodeTracker.getWatchedNodeWithId(id, false);
      };
    }

    ${pageScripts.interactReplayer};
})();`;

const installedSymbol = Symbol('InjectedScripts.Installed');

export const CorePageInjectedScript = heroIncludes;

export default class InjectedScripts {
  public static JsPath = `HERO.JsPath`;
  public static Fetcher = `HERO.Fetcher`;
  public static PageEventsCallbackName = pageEventsCallbackName;

  public static install(puppetPage: IPuppetPage, showInteractions = false): Promise<any> {
    if (puppetPage[installedSymbol]) return;
    puppetPage[installedSymbol] = true;

    return Promise.all([
      puppetPage.addPageCallback(pageEventsCallbackName),
      puppetPage.addNewDocumentScript(injectedScript, true),
      puppetPage.addNewDocumentScript(`delete window.${pageEventsCallbackName}`, false),
      showInteractions ? puppetPage.addNewDocumentScript(showInteractionScript, true) : null,
    ]);
  }

  public static installInteractionScript(puppetPage: IPuppetPage): Promise<void> {
    return puppetPage.addNewDocumentScript(showInteractionScript, true);
  }

  public static async installDomStorageRestore(puppetPage: IPuppetPage): Promise<void> {
    await puppetPage.addNewDocumentScript(
      `(function restoreDomStorage() {
const exports = {}; // workaround for ts adding an exports variable
${stringifiedTypeSerializerClass};

${pageScripts.domStorage};
})();`,
      true,
    );
  }
}
