import net, { type AddressInfo } from "node:net";

/**
 * Two stand-ins for a database, so the tests about *reaching* one need no
 * Postgres at all and give the same answer on every machine.
 *
 * `deadPort` is an address nothing listens on. `refusingPostgres` is a server
 * that answers the startup message the way a real one does when it will not
 * let this client in: a single `ErrorResponse` carrying a SQLSTATE, then a
 * close. The driver cannot tell it from the real thing, which is the point:
 * "a live server said no" has to stay a refusal, and proving that against a
 * real server would need a role with a password and a database to be missing,
 * neither of which a laptop running on trust auth can promise.
 */

/** A port on 127.0.0.1 that was free a moment ago and has nothing on it now. */
export async function deadPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

export interface RefusingPostgres {
  port: number;
  close: () => Promise<void>;
}

/** One field of an `ErrorResponse`: a type byte, then a NUL-terminated string. */
function field(type: string, value: string): Buffer {
  return Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(`${value}\0`, "utf8")]);
}

/** A server that refuses every connection with `sqlstate`, as Postgres would. */
export async function refusingPostgres(sqlstate: string, message: string): Promise<RefusingPostgres> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.once("data", () => {
      const body = Buffer.concat([
        field("S", "FATAL"),
        field("V", "FATAL"),
        field("C", sqlstate),
        field("M", message),
        Buffer.from([0]),
      ]);
      const header = Buffer.alloc(5);
      header.write("E", 0, "ascii");
      header.writeInt32BE(body.length + 4, 1);
      socket.end(Buffer.concat([header, body]));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
