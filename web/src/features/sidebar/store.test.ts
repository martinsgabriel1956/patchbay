import { expect, it } from "vitest";
import { numberChannels, withChannel } from "./store";

it("numberChannels: mantém números válidos e dá max+1 a quem falta ou repete", () => {
  const contents = {
    "a.json": { name: "a", channel: 3 },
    "b.json": { name: "b" }, // legado, sem número
    "a cópia.json": { name: "a cópia", channel: 3 }, // duplicada: repete o 3
    "c.json": { name: "c", channel: 1 },
    "x.json": null, // JSON inválido: não mexe
    "d.json": { name: "d", channel: 0 }, // inválido
  };
  const order = ["a.json", "b.json", "a cópia.json", "c.json", "x.json", "d.json"];
  expect(numberChannels(order, contents)).toEqual([
    { path: "b.json", channel: 4 },
    { path: "a cópia.json", channel: 5 },
    { path: "d.json", channel: 6 },
  ]);
  // Tudo numerado e sem repetição: nada a gravar.
  expect(numberChannels(["c.json"], contents)).toEqual([]);
});

it("withChannel: o número entra logo depois do name, sem duplicar a chave", () => {
  const out = withChannel({ id: "1", name: "a", channel: 9, kind: "http" }, 2);
  expect(Object.keys(out)).toEqual(["id", "name", "channel", "kind"]);
  expect(out.channel).toBe(2);
});
