const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtemp, rm } = require("node:fs/promises");
const { createServer } = require("node:net");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const site = id(1);
const restricted = id(2);
const deviceId = id(3);
const loadId = id(4);
const sourceId = id(5);
const energyId = id(6);
const powerId = id(7);
const ruleId = id(8);
const now = new Date().toISOString();
const page = data => ({ data, page: 1, total: data.length, totalPages: data.length ? 1 : 0 });
const simulationRoot = "/api/v1/automations/energy-simulation/rules";
const topology = {
  sources: [{ id: sourceId, name: "Arrivée réseau", type: "GRID", status: "MAINTENANCE", ratedPowerW: "4000" }],
  feeds: [{ id: id(9), name: "Arrivée tableau", sourceId, busId: id(10), observedState: "CLOSED", observedAt: now }],
  buses: [{ id: id(10), name: "Bus général" }],
  boards: [{ id: id(11), name: "Tableau général", busId: id(10), location: "Local technique" }],
  circuits: [{ id: id(12), name: "Éclairage", boardId: id(11), code: "C01", priority: "FLEXIBLE", status: "IN_SERVICE" }],
  loads: [{ id: loadId, name: "Éclairage du hall", circuitId: id(12), priority: "FLEXIBLE", ratedPowerW: "400" }],
  "metering-points": [
    { id: energyId, name: "Compteur général", boardId: id(11), deviceId, scope: "BOARD", measurementMode: "INTERVAL", flowDirection: "IMPORT", unit: "kWh" },
    { id: powerId, name: "Puissance générale", loadId, deviceId, scope: "LOAD", measurementMode: "INSTANTANEOUS", flowDirection: "IMPORT", unit: "W" },
  ],
  "control-endpoints": [
    { id: id(13), name: "Canal déclaré", deviceId, targetLoadId: loadId, isEnabled: false, verificationMethod: "NONE", verifiedState: "ON", verifiedAt: now },
    { id: id(14), name: "Canal avec preuve", deviceId, targetLoadId: loadId, isEnabled: false, verificationMethod: "AUXILIARY_CONTACT", verifiedState: "OFF", verifiedAt: now },
  ],
};
const rule = { id: ruleId, name: "Surcharge du tableau", isActive: true,
  action: { policy: { availablePowerW: 1000, hysteresisW: 100, loads: [{ loadId, maintenanceExcluded: false }] } } };
const writes = [];
let role = "TENANT_ADMIN";
let runs = [];

function fixture(request, knownOrigin) {
  const url = new URL(request.url);
  if (url.origin !== knownOrigin) throw new Error("L’API de recette doit rester sur la boucle locale.");
  const path = url.pathname;
  if (request.method !== "GET") {
    writes.push([request.method, path]);
    assert.equal(path, `${simulationRoot}/${ruleId}/runs`);
    const input = JSON.parse(request.postData);
    assert.equal(input.buildingId, site);
    assert.equal(input.protection, "CLEAR");
    assert.equal(input.maintenance, "UNKNOWN");
    assert.equal(input.initialLoads.length, 0);
    assert.match(input.requestId, /^[\da-f-]{36}$/);
    runs = [{ id: id(15), scenarioId: input.scenarioId, evaluatedAt: input.evaluatedAt, decision: "NO_ACTION",
      reason: "MAINTENANCE_NOT_CLEAR", result: { mode: "DRY_RUN", action: null, measuredDemandW: null,
        projectedDemandBeforeW: null, projectedDemandAfterW: null, exclusions: [] } }];
    return [200, runs[0]];
  }
  if (path.endsWith("/auth/me")) return [200, { user: { id: id(19), tenantId: id(20), role, name: "Compte fictif", email: "recette@example.test" } }];
  if (path.endsWith("/tenants/current/subscription")) return [200, { limits: { hasExport: true }, plan: "PRO" }];
  if (path.endsWith("/buildings")) return [200, page([
    { id: site, name: "Site principal", timeZone: "Africa/Lubumbashi", isActive: true },
    { id: restricted, name: "Site restreint", timeZone: "Africa/Kinshasa", isActive: true },
  ])];
  const entry = /^\/api\/v1\/energy\/buildings\/([^/]+)\/topology\/([^/]+)$/.exec(path);
  if (entry) return entry[1] === restricted ? [403, { error: "Accès refusé" }] : [200, page(topology[entry[2]] ?? [])];
  if (path.endsWith("/energy/metered")) {
    assert.equal(url.searchParams.get("buildingId"), site);
    if (url.searchParams.get("meteringPointId") === powerId) {
      return [200, { timeZone: "Africa/Lubumbashi", latestPower: { time: now, valueW: 0, quality: "MEASURED" } }];
    }
    assert.equal(url.searchParams.get("buildingTotal"), "true");
    return [200, { measuredKWh: 100, estimatedKWh: null, samples: 2, gaps: 1, timeZone: "Africa/Lubumbashi",
      bySource: [{ measuredKWh: 100, estimatedKWh: null, sourceId, sourceType: "GRID" }] }];
  }
  if (path.endsWith("/energy/summary")) return [200, { totalKwh: 10, estimatedCostUSD: 1.2, peakPowerW: 300, avgPowerW: 200, deviceCount: 1 }];
  if (path.endsWith("/energy/consumption")) return [200, [{ bucket: now, total_kwh: 10, avg_power_w: 200 }]];
  if (path.endsWith("/energy/by-zone")) return [200, []];
  if (path.endsWith("/alerts")) return [200, page([{ id: id(16), message: "Tension basse", severity: "WARNING", createdAt: now }])];
  if (path.endsWith("/devices")) return [200, page([{ id: deviceId, buildingId: site, name: "Compteur du hall", type: "ENERGY_METER",
    isOnline: true, protocol: "MQTT", config: {}, states: [{ state: { state: "on", source: "device_reported" } }] }])];
  if (path.endsWith("/zones")) return [200, []];
  if (path === simulationRoot) {
    assert.notEqual(role, "VIEWER");
    return [200, page([rule])];
  }
  if (path === `${simulationRoot}/${ruleId}/runs`) return [200, page(runs)];
  return [404, { error: "Route absente du scénario" }];
}

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function until(get, label, duration = 12000) {
  const deadline = Date.now() + duration;
  do {
    const result = await get().catch(() => undefined);
    if (result) return result;
    await delay(120);
  } while (Date.now() < deadline);
  throw new Error(`Le scénario ne montre pas : ${label}`);
}

async function run() {
  const webPort = await freePort();
  const debugPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  const profile = await mkdtemp(join(tmpdir(), "afrixora-energy-browser-"));
  const frontend = resolve(process.env.AFRIXORA_TEST_NEXT_DIR ?? join(__dirname, ".."));
  const next = require.resolve("next/dist/bin/next");
  const processes = [];
  const logs = [];
  function start(command, args) {
    const child = spawn(command, args, { cwd: frontend, stdio: ["ignore", "pipe", "pipe"] });
    for (const output of [child.stdout, child.stderr]) output.on("data", chunk => {
      logs.push(String(chunk));
      if (logs.length > 20) logs.shift();
    });
    child.on("error", error => logs.push(error.message));
    processes.push(child);
  }

  let socket;
  let inspectPage;
  try {
    start(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(webPort)]);
    await until(async () => (await fetch(origin + "/energy")).ok, "serveur Next.js prêt");
    const chromeArgs = ["--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking",
      "--no-first-run", "--no-default-browser-check", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, "about:blank"];
    if (process.env.AFRIXORA_CHROME_NO_SANDBOX === "1") chromeArgs.unshift("--no-sandbox");
    start(process.env.AFRIXORA_CHROME_BIN || "google-chrome", chromeArgs);
    const target = await until(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item =>
      item.type === "page" && item.webSocketDebuggerUrl), "Chrome prêt");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let counter = 0;
    const requests = new Map();
    const fixtureErrors = [];
    function send(method, params = {}) {
      const id = ++counter;
      const reply = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return reply;
    }
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = requests.get(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
        requests.delete(message.id);
      }
      if (message.method === "Fetch.requestPaused") {
        const { requestId, request } = message.params;
        let response;
        try { response = fixture(request, origin); }
        catch (error) { fixtureErrors.push(error); response = [500, { error: "Recette échouée" }]; }
        const [responseCode, body] = response;
        void send("Fetch.fulfillRequest", { requestId, responseCode,
          responseHeaders: [
            { name: "Content-Type", value: "application/json; charset=utf-8" },
            { name: "Cache-Control", value: "no-store" },
          ],
          body: Buffer.from(JSON.stringify(body)).toString("base64"),
        }).catch(error => fixtureErrors.push(error));
      }
    });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/*", requestStage: "Request" }] });
    const navigate = path => send("Page.navigate", { url: origin + path });
    async function evaluate(expression) {
      const response = await send("Runtime.evaluate", { expression, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
      return response.result.value;
    }
    inspectPage = () => evaluate("document.body?.innerText.slice(0, 1600)");
    const see = text => until(() => evaluate(`document.body?.innerText.replace(/\\s+/g, " ").includes(${JSON.stringify(text)})`), text);
    const tab = name => evaluate(`(() => {
      const tab = [...document.querySelectorAll('[role=tab]')].find(item => item.textContent.trim() === ${JSON.stringify(name)});
      tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); tab.click();
    })()`);
    const select = (name, value) => evaluate(`(() => {
      const field = [...document.querySelectorAll('label')].find(item => item.textContent.startsWith(${JSON.stringify(name)})).querySelector('select');
      field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);

    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 850, deviceScaleFactor: 1, mobile: true });
    await navigate("/energy");
    await see("Gestion énergétique");
    await see("Source actuelle confirmée Inconnue");
    await select("Point d’import", energyId);
    await select("Point de puissance", powerId);
    await see("100 kWh");
    await see("0 kW");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "Vue mobile sans débordement horizontal");

    await tab("Finances");
    await see("Dépense indisponible");
    await see("Estimation historique en USD");
    await tab("Sources");
    await see("En maintenance");
    await see("Dernières positions observées");
    await tab("Alertes et maintenance");
    await see("Tension basse");

    await tab("Simulations");
    await see("Surcharge du tableau");
    await evaluate(`(() => {
      const date = new Date(Date.now() - 60000);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.querySelector('[name=evaluatedAt]').value = local;
      document.querySelector('[name=protection]').value = "CLEAR";
      document.querySelector('button[type=submit]').click();
    })()`);
    await see("Aucune action proposée");
    await see("La maintenance est active ou son état est inconnu.");

    await tab("Analyses historiques");
    await see("Exporter en CSV");
    await see("Courbe de consommation");

    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await tab("Distribution");
    await see("Éclairage du hall");
    const href = await evaluate("[...document.links].find(link => link.getAttribute('href').startsWith('/devices?deviceId=')).getAttribute('href')");
    await navigate(href);
    await see("Compteur du hall");
    await see("Charges physiques liées");
    await see("État physique inconnu");
    await see("Dernier état physiquement vérifié");

    role = "VIEWER";
    await navigate(`/energy?buildingId=${restricted}&view=simulation`);
    await see("Vous n’avez pas accès à cette vue pour ce bâtiment.");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=tab]')].some(item => item.textContent.trim() === 'Simulations')"), false);
    assert.deepEqual(writes, [["POST", `${simulationRoot}/${ruleId}/runs`]]);
    assert.deepEqual(fixtureErrors, []);
    console.log("Recette navigateur Énergie V2 réussie : mobile, mesures, source, finances, alertes, simulation, appareils et accès refusé.");
  } catch (error) {
    console.error(logs.join(""));
    if (inspectPage) console.error(await inspectPage().catch(() => ""));
    throw error;
  } finally {
    socket?.close();
    await Promise.all(processes.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) return resolve();
      child.once("exit", resolve);
      child.kill();
    })));
    await rm(profile, { force: true, recursive: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
