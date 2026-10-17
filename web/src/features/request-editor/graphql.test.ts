import type { HttpResponse } from "@api/schemas";
import { buildSchema, introspectionFromSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { schemaFrom } from "./graphql";

const response = (status: number, body: string): HttpResponse => ({
  status,
  statusText: "",
  headers: [],
  body,
  isBinary: false,
  truncated: false,
  timeMs: 1,
  sizeBytes: body.length,
  decodedSizeBytes: body.length,
});

describe("schemaFrom", () => {
  it("monta o schema da resposta da introspection", () => {
    const data = introspectionFromSchema(buildSchema("type Query { me: String }"));
    const schema = schemaFrom(response(200, JSON.stringify({ data })));
    expect(Object.keys(schema.getQueryType()?.getFields() ?? {})).toEqual(["me"]);
  });

  it("introspection desligada ou resposta estranha vira erro legível", () => {
    const disabled = JSON.stringify({ errors: [{ message: "introspection is disabled" }] });
    expect(() => schemaFrom(response(200, disabled))).toThrow(
      "Introspection indisponível: introspection is disabled",
    );
    expect(() => schemaFrom(response(404, "Not Found"))).toThrow(/HTTP 404/);
  });
});
