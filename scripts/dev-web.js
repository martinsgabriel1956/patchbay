// dev:web: api numa porta fixa + Vite no browser, sem Tauri. O Vite injeta o token via proxy.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = {
  ...process.env,
  PORT: process.env.PORT ?? "47615",
  PATCHBAY_TOKEN: randomBytes(32).toString("base64url"),
  PATCHBAY_DEV_ORIGIN: "http://localhost:5173",
};
// stdin "pipe" fica aberto enquanto este processo vive: a api sai quando ele morre.
const kids = [
  spawn("npm", ["run", "dev", "-w", "api"], { stdio: ["pipe", "inherit", "inherit"], env }),
  spawn("npm", ["run", "dev", "-w", "web"], { stdio: "inherit", env }),
];
for (const kid of kids) {
  kid.on("exit", (code) => {
    for (const k of kids) k.kill();
    process.exit(code ?? 0);
  });
}
