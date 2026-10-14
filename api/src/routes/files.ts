// Arquivos do workspace e histórico (PLANNING §6 › Arquivos). A api só move bytes: quem formata
// o JSON é a web. Todo path passa por workspace.resolve().
import { cp, mkdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail } from "../lib/http.js";
import { exists, readHistory, resolve, trash, tree, write } from "../lib/workspace.js";

const ERRNO: Record<string, number> = {
  ENOENT: 404,
  EEXIST: 409,
  ENOTEMPTY: 409,
  EISDIR: 400,
  ENOTDIR: 400,
  EINVAL: 400, // mover uma pasta para dentro dela mesma
  ERR_FS_CP_EINVAL: 400,
};
const PathQuery = z.object({ path: z.string().min(1) });
const FromTo = z.object({ from: z.string().min(1), to: z.string().min(1) });
const LimitQuery = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100) });

const parse = <S extends z.ZodType>(schema: S, value: unknown): z.output<S> => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fail(400, z.prettifyError(parsed.error));
};

const copy = (from: string, to: string) =>
  cp(from, to, { recursive: true, errorOnExist: true, force: false });

export function filesRoute(app: FastifyInstance) {
  app.register(async (scope) => {
    scope.setErrorHandler((err, _req, reply) => {
      const e = err as Error & { status?: number; statusCode?: number; code?: string };
      reply.code(e.status ?? e.statusCode ?? ERRNO[e.code ?? ""] ?? 500).send({ error: e.message });
    });

    scope.get("/files/tree", () => tree());

    scope.get("/files", async (req, reply) => {
      const abs = await resolve(parse(PathQuery, req.query).path);
      return reply.type("text/plain; charset=utf-8").send(await readFile(abs, "utf8"));
    });

    // Corpo text/plain com o conteúdo. Path terminado em "/" cria a pasta.
    scope.put("/files", { bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
      const rel = parse(PathQuery, req.query).path;
      if (rel.endsWith("/")) await mkdir(await resolve(rel), { recursive: true });
      else if (typeof req.body === "string") await write(rel, req.body);
      else fail(400, "body must be text/plain");
      return reply.code(204).send();
    });

    scope.delete("/files", async (req, reply) => {
      await trash(parse(PathQuery, req.query).path);
      return reply.code(204).send();
    });

    // move = renomear/mover; copy = duplicar. Nunca sobrescrevem.
    for (const [url, op] of [
      ["/files/move", rename],
      ["/files/copy", copy],
    ] as const) {
      scope.post(url, async (req, reply) => {
        const { from, to } = parse(FromTo, req.body);
        const [src, dest] = await Promise.all([resolve(from), resolve(to)]);
        if (!(await exists(src))) fail(404, `not found: ${from}`);
        if (await exists(dest)) fail(409, `already exists: ${to}`);
        await mkdir(path.dirname(dest), { recursive: true });
        await op(src, dest);
        return reply.code(204).send();
      });
    }

    scope.get("/history", (req) => readHistory(parse(LimitQuery, req.query).limit));
  });
}
