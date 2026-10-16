import { expect, it } from "vitest";
import { pick } from "./json-path";

const doc = {
  data: {
    items: [
      { id: 1, name: "a", tags: ["x"] },
      { id: 2, name: "b" },
    ],
    "x.y": null,
  },
};

it("segue chaves e índices, com $ e ponto opcionais", () => {
  expect(pick(doc, "data.items[0].name")).toBe("a");
  expect(pick(doc, "$.data.items[1].id")).toBe(2);
  expect(pick(doc, ".data.items[-1].name")).toBe("b");
  expect(pick(doc.data.items, "[0].id")).toBe(1);
  expect(pick(doc, 'data["x.y"]')).toBe(null);
  expect(pick(doc, "")).toBe(doc);
  expect(pick(doc, "$")).toBe(doc);
  expect(pick(doc, "$.")).toBe(doc);
});

it("* espalha e devolve lista; o que falta some", () => {
  expect(pick(doc, "data.items[*].id")).toEqual([1, 2]);
  expect(pick(doc, "data.items.*.name")).toEqual(["a", "b"]);
  expect(pick(doc, "data.items[*].tags[0]")).toEqual(["x"]);
  expect(pick(doc, "data.nada[*]")).toEqual([]);
});

it("caminho sem nada é undefined; malformado lança", () => {
  expect(pick(doc, "data.nada")).toBeUndefined();
  expect(pick(doc, "data.items.name")).toBeUndefined();
  expect(() => pick(doc, "data.items[x]")).toThrow();
  expect(() => pick(doc, "data.items[")).toThrow(/Caminho inválido em "\["/);
  expect(() => pick(doc, "$..id")).toThrow();
});
