import { expect, it } from "vitest";
import { diagnose } from "./diagnose";

it("diagnostica as falhas conhecidas e deixa o resto cru", () => {
  expect(diagnose("error", "connect ECONNREFUSED 127.0.0.1:1")).toEqual({
    hint: "Nada escutando em 127.0.0.1:1. O servidor está de pé nessa porta?",
    fix: "url",
  });
  expect(diagnose("error", "ECONNREFUSED")?.hint).toMatch(/nesse host e porta/);
  expect(diagnose("error", "invalid URL: http://not a url")?.fix).toBe("url");
  expect(diagnose("error", "getaddrinfo ENOTFOUND api.nada")?.hint).toMatch(/Host api\.nada/);
  // Variável vence "URL inválida": é a causa de verdade.
  expect(diagnose("error", "invalid URL: http://{{baseurl}}/x", "{{baseUrl}}/x")?.hint).toMatch(
    /\{\{baseUrl\}\}/,
  );
  expect(diagnose("error", "self-signed certificate")?.hint).toMatch(/TLS/);
  expect(diagnose("timeout", "timeout after 30000 ms")?.hint).toMatch(/Opções › Timeout/);
  expect(diagnose("error", "502 Bad Gateway")?.hint).toMatch(/api local/);
  expect(diagnose("error", "algo inesperado")).toBeNull();
});
