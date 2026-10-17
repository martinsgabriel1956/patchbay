import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { listen, oauthRoute } from "./oauth.js";

const app = Fastify();
oauthRoute(app);
afterAll(() => app.close());

const STATE = "s".repeat(32);
const start = async () => {
  const res = await app.inject({ method: "POST", url: "/oauth/listen", payload: { state: STATE } });
  expect(res.statusCode).toBe(200);
  return (res.json() as { port: number }).port;
};
const callback = (port: number, query: string) =>
  fetch(`http://127.0.0.1:${port}/callback?${query}`);
const wait = (port: number) => app.inject({ method: "GET", url: `/oauth/listen/${port}` });

describe("listener do redirect OAuth", () => {
  it("recusa state ausente ou curto", async () => {
    const res = await app.inject({ method: "POST", url: "/oauth/listen", payload: { state: "x" } });
    expect(res.statusCode).toBe(400);
  });

  it("ignora state errado e entrega o code do state certo, uma vez só", async () => {
    const port = await start();
    expect((await callback(port, "code=nope&state=outro")).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${port}/favicon.ico`)).status).toBe(404);
    const ok = await callback(port, `code=abc&state=${STATE}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toMatch(/login concluído/);

    const res = await wait(port);
    expect(res.json()).toEqual({ code: "abc" });
    expect((await wait(port)).statusCode).toBe(404); // uso único
    await expect(callback(port, `code=abc&state=${STATE}`)).rejects.toThrow(); // fechou
  });

  it("repassa o erro do provedor", async () => {
    const port = await start();
    const pending = wait(port);
    await callback(port, `error=access_denied&error_description=negado&state=${STATE}`);
    const res = await pending;
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "negado" });
  });

  it("expira e fecha a porta", async () => {
    const listener = await listen(STATE, 20);
    expect(await listener.result).toEqual({
      error: "Tempo esgotado esperando o login no browser.",
      status: 408,
    });
    await expect(callback(listener.port, `code=abc&state=${STATE}`)).rejects.toThrow();
  });
});
