import { createSession, ITestKoaServer } from '@ulixee/hero-testing/helpers';
import { Helpers } from '@ulixee/hero-testing';
import { LoadStatus } from '@ulixee/hero-interfaces/Location';
import Core from '@ulixee/hero-core';
import PageStateGenerator from '../lib/PageStateGenerator';

let koaServer: ITestKoaServer;
beforeAll(async () => {
  await Core.start();
  koaServer = await Helpers.runKoaServer(true);
});
afterAll(Helpers.afterAll);
afterEach(Helpers.afterEach);

describe('pageStateGenerator', () => {
  test('extracts common asserts only from the given time range', async () => {
    koaServer.get('/pageStateGeneratorRange1', ctx => {
      ctx.body = `
  <body>
    <h1>Title 1</h1>
    <div id="div1">This is page 1</div>
    <ul>
      <li class="li">1</li>
    </ul>
    <script>
    window.add = function () {
      const li = document.createElement('li');
      li.classList.add('li');
      li.textContent = 'add';
      document.querySelector('ul').append(li);
    }
    </script>
  </body>
      `;
    });

    const pageStateGenerator = new PageStateGenerator('a');
    async function run() {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2e3));
      const { tab, session } = await createSession();
      await tab.goto(`${koaServer.baseUrl}/pageStateGeneratorRange1`);
      await tab.waitForLoad(LoadStatus.PaintingStable);
      await tab.flushDomChanges();
      const startTime = Date.now();
      await tab.getJsValue(`add()`);
      await tab.getJsValue(`add()`);
      await tab.close();
      pageStateGenerator.addSession(session.sessionState.db, tab.id, [startTime, Date.now()]);
      pageStateGenerator.addState('1', session.id);
    }
    await Promise.all([run(), run(), run()]);

    await pageStateGenerator.evaluate();
    const state = pageStateGenerator.statesByName.get('1');
    expect(state).toBeTruthy();
    expect(state.sessionIds.size).toBe(3);
    expect(Object.keys(state.assertsByFrameId)).toHaveLength(1);
    const asserts = Object.values(state.assertsByFrameId[1]);
    expect(
      asserts.filter(x => {
        return x.query.includes('TITLE') || x.query.includes('DIV') || x.query.endsWith('/UL)');
      }),
    ).toHaveLength(0);

    expect(asserts.find(x => x.query === 'count(/HTML/BODY/UL/LI)').result).toBe(3);
  }, 20e3);

  test('can find differences between two pages', async () => {
    koaServer.get('/pageStateGenerator1', ctx => {
      ctx.body = `
  <body>
    <h1>Title 1</h1>
    <div id="div1">This is page 1</div>
    <ul>
      <li class="li">1</li>
      <li class="li">2</li>
      <li class="li">3</li>
    </ul>

    <script>
    window.add = function () {
      const li = document.createElement('li');
      li.classList.add('li');
      li.textContent = 'add';
      document.querySelector('ul').append(li);
    }
    </script>
  </body>
      `;
    });
    koaServer.get('/pageStateGenerator2', ctx => {
      ctx.body = `
  <body>
    <h1>Title 2</h1>
    <div id="div2">This is page 2</div>
    <ul></ul>

    <script>
    window.add = function () {
      const li = document.createElement('li');
      li.classList.add('li');
      li.textContent = 'add';
      document.querySelector('ul').append(li);
    }
    </script>
  </body>
      `;
    });

    // first time through, get the line number, otherwise use the "id"
    // should not run any more commands after waitForPageState
    const locationId = '1';
    const pageStateGenerator = new PageStateGenerator(locationId);
    async function run(path: string, state: string) {
      // just give some time randomization
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2e3));
      const { tab, session } = await createSession();
      await tab.goto(`${koaServer.baseUrl}/${path}`);
      await tab.waitForLoad(LoadStatus.PaintingStable);
      await tab.flushDomChanges();
      const startTime = Date.now();
      await tab.getJsValue(`add()`);
      if (state === '1') await tab.getJsValue(`add()`);
      await tab.close();
      pageStateGenerator.addSession(session.sessionState.db, tab.id, [startTime, Date.now()]);
      pageStateGenerator.addState(state, session.id);
    }

    await Promise.all([
      run('pageStateGenerator1', '1'),
      run('pageStateGenerator1', '1'),
      run('pageStateGenerator2', '2'),
      run('pageStateGenerator2', '2'),
    ]);

    await pageStateGenerator.evaluate();

    const states1 = pageStateGenerator.statesByName.get('1').assertsByFrameId[1];
    const states2 = pageStateGenerator.statesByName.get('2').assertsByFrameId[1];
    expect(states1).not.toEqual(states2);

    // add 2 to 3 existing
    expect(states1['count(/HTML/BODY/UL/LI)'].result).toBe(5);
    // add 1 to non-existent
    expect(states2['count(/HTML/BODY/UL/LI)'].result).toBe(1);
  }, 20e3);

  test('can diff pages based on removed elements', async () => {
    koaServer.get('/pageStateRemove', ctx => {
      ctx.body = `
  <body>
    <h1>Remove Page</h1>
    <ul>
      <li class="li">1</li>
      <li class="li">2</li>
      <li class="li">3</li>
    </ul>

    <script>
    window.remove = function () {
      document.querySelector('li').remove()
    }
    </script>
  </body>
      `;
    });

    const pageStateGenerator = new PageStateGenerator('remove');
    async function run(state: string) {
      // just give some time randomization
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2e3));
      const { tab, session } = await createSession();
      await tab.goto(`${koaServer.baseUrl}/pageStateRemove`);
      await tab.waitForLoad(LoadStatus.PaintingStable);
      await tab.flushDomChanges();
      const startTime = Date.now();
      await tab.getJsValue(`remove()`);
      if (state === '1') await tab.getJsValue(`remove()`);
      await tab.close();
      pageStateGenerator.addSession(session.sessionState.db, tab.id, [startTime, Date.now()]);
      pageStateGenerator.addState(state, session.id);
    }

    await Promise.all([run('1'), run('1'), run('2'), run('2')]);

    await pageStateGenerator.evaluate();

    const states1 = pageStateGenerator.statesByName.get('1').assertsByFrameId[1];
    const states2 = pageStateGenerator.statesByName.get('2').assertsByFrameId[1];
    expect(states1).not.toEqual(states2);

    expect(states1['count(/HTML/BODY/UL/LI)'].result).toBe(1);
    expect(states2['count(/HTML/BODY/UL/LI)'].result).toBe(2);
  }, 20e3);

  test('can find attribute changes', async () => {
    koaServer.get('/pageStateAttr', ctx => {
      ctx.body = `
  <body>
    <h1>Attributes Page</h1>
    <div class="slider" style="width:0;">&nbsp;</div>

    <script>
    window.tick = function (pct) {
      document.querySelector('.slider').style.width = pct + '%';
    }
    </script>
  </body>
      `;
    });

    const pageStateGenerator = new PageStateGenerator('attr');
    async function run(state: string) {
      // just give some time randomization
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2e3));
      const { tab, session } = await createSession();
      await tab.goto(`${koaServer.baseUrl}/pageStateAttr`);
      await tab.waitForLoad(LoadStatus.PaintingStable);
      await tab.flushDomChanges();
      const startTime = Date.now();
      if (state === '1') await tab.getJsValue(`tick(100)`);
      else await tab.getJsValue(`tick(50)`);
      await tab.close();
      pageStateGenerator.addSession(session.sessionState.db, tab.id, [startTime, Date.now()]);
      pageStateGenerator.addState(state, session.id);
    }

    await Promise.all([run('1'), run('1'), run('2'), run('2')]);

    await pageStateGenerator.evaluate();

    const states1 = pageStateGenerator.statesByName.get('1').assertsByFrameId[1];
    const states2 = pageStateGenerator.statesByName.get('2').assertsByFrameId[1];
    expect(states1).not.toEqual(states2);

    expect(states1['count(/HTML/BODY/DIV[@class="slider"][@style="width: 100%;"])'].result).toBe(1);
    expect(states2['count(/HTML/BODY/DIV[@class="slider"][@style="width: 50%;"])'].result).toBe(1);
  }, 20e3);

  test('can handle redirects', async () => {
    let counter = 0;
    koaServer.get('/pageStateRedirect', ctx => {
      const redirectLocation =
        counter % 2 === 0 ? 'pageStateRedirectsEnd1' : 'pageStateRedirectsEnd2';

      counter += 1;
      ctx.body = `
<head><meta http-equiv = "refresh" content = "0; url = ${koaServer.baseUrl}/${redirectLocation}"</head>
<body><h1>Redirect Page</h1></body>`;
    });

    koaServer.get('/pageStateRedirectsEnd1', ctx => {
      ctx.body = `<body><h1>Page 1</h1></body>`;
    });

    koaServer.get('/pageStateRedirectsEnd2', ctx => {
      ctx.body = `<body><h1>Page 2</h1></body>`;
    });

    const pageStateGenerator = new PageStateGenerator('1');
    async function run() {
      // just give some time randomization
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2e3));
      const { tab, session } = await createSession();
      const goto = tab.goto(`${koaServer.baseUrl}/pageStateRedirect`);
      await goto;
      await tab.waitForLocation('change');

      await tab.waitForLoad(LoadStatus.HttpResponded);
      const startTime = tab.navigations.top.statusChanges.get('HttpResponded');
      const state = tab.navigations.top.finalUrl.endsWith('1') ? '1' : '2';
      await tab.waitForLoad(LoadStatus.PaintingStable);

      await tab.close();
      pageStateGenerator.addSession(session.sessionState.db, tab.id, [startTime, Date.now()]);
      pageStateGenerator.addState(state, session.id);
    }

    await Promise.all([run(), run(), run(), run()]);

    await pageStateGenerator.evaluate();

    const states1 = pageStateGenerator.statesByName.get('1').assertsByFrameId[1];
    const states2 = pageStateGenerator.statesByName.get('2').assertsByFrameId[1];
    expect(states1).not.toEqual(states2);

    expect(states1['string(/HTML/BODY/H1)']).toBeTruthy();
    expect(states2['string(/HTML/BODY/H1)']).toBeTruthy();
    expect(states1['string(/HTML/BODY/H1)'].result).toBe('Page 1');
    expect(states2['string(/HTML/BODY/H1)'].result).toBe('Page 2');
    expect(states1['count(//H1[text()="Page 1"])'].result).toBe(1);
    expect(states2['count(//H1[text()="Page 2"])'].result).toBe(1);
  }, 20e3);

  test.todo('can add more sessions without re-running the old ones');

  test.todo('can save and reload results');
});
