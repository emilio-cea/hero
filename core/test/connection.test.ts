import { Helpers } from '@ulixee/hero-testing';
import Hero, { Core } from '@ulixee/hero-fullstack';
import * as http from 'http';
import { Log } from '@ulixee/commons/lib/Logger';
import BrowserEmulator from '@ulixee/default-browser-emulator';
import { DependenciesMissingError } from '@ulixee/chrome-app/lib/DependenciesMissingError';
import ChromeApp from '@ulixee/chrome-app/index';
import BrowserEngine from '@ulixee/hero-plugin-utils/lib/BrowserEngine';

const validate = jest.spyOn(BrowserEngine.prototype, 'verifyLaunchable');
const logError = jest.spyOn(Log.prototype, 'error');

let httpServer: Helpers.ITestHttpServer<http.Server>;

beforeAll(async () => {
  httpServer = await Helpers.runHttpServer({ onlyCloseOnFinal: true });
});
afterAll(Helpers.afterAll);
afterEach(Helpers.afterEach);

describe('basic connection tests', () => {
  it('should goto and waitForLocation', async () => {
    // bind a core server to core

    const hero = new Hero();
    const sessionId = await hero.sessionId;
    expect(sessionId).toBeTruthy();

    const { url } = httpServer;
    await hero.goto(url);

    const html = await hero.document.documentElement.outerHTML;
    expect(html).toBe('<html><head></head><body>Hello world</body></html>');

    await hero.close();
  });

  it('should be able to set a new connection on the default hero', async () => {
    // bind a core server to core
    const hero = new Hero();
    const sessionId = await hero.sessionId;
    expect(sessionId).toBeTruthy();

    const { url } = httpServer;
    await hero.goto(url);

    const html = await hero.document.documentElement.outerHTML;
    expect(html).toBe('<html><head></head><body>Hello world</body></html>');

    await hero.close();
  });

  it('should be able to configure a new hero', async () => {
    // bind a core server to core
    const hero = new Hero();
    const sessionId = await hero.sessionId;
    expect(sessionId).toBeTruthy();

    const { url } = httpServer;
    await hero.goto(url);

    const html = await hero.document.documentElement.outerHTML;
    expect(html).toBe('<html><head></head><body>Hello world</body></html>');

    await hero.close();
  });

  it('should throw an error informing how to install dependencies', async () => {
    class CustomEmulator extends BrowserEmulator {
      public static id = 'emulate-test';
      public static selectBrowserMeta() {
        return super.selectBrowserMeta();
      }

      public static onBrowserWillLaunch() {
        // don't change launch args so it doesn't reuse a previous one
      }
    }
    Core.use(CustomEmulator as any);

    logError.mockClear();
    validate.mockClear();
    validate.mockRejectedValueOnce(
      new DependenciesMissingError(
        `You can resolve this by running the apt dependency installer at:${ChromeApp.aptScriptPath}`,
        'Chrome',
        ['libnacl'],
      ),
    );

    logError.mockImplementationOnce(() => null /* no op*/);

    const hero1 = new Hero({
      browserEmulatorId: 'emulate-test',
    });
    Helpers.needsClosing.push(hero1);

    await expect(hero1).rejects.toThrowError(
      'CoreServer needs further setup to launch the browserEmulator. See server logs',
    );
    expect(logError).toHaveBeenCalledTimes(1);
    const error = String((logError.mock.calls[0][1] as any).error);
    expect(error).toMatch('PuppetLaunchError');
    expect(error).toMatch('You can resolve this by running');
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
