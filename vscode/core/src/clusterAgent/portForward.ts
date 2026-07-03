/**
 * Local TCP listener tunneling to a pod port via the Kubernetes
 * port-forward subresource — programmatic `kubectl port-forward`.
 * Used when the extension host has no route to cluster service DNS
 * (the normal laptop-to-cluster case).
 *
 * @kubernetes/client-node's PortForward does NOT propagate remote
 * close/error back to the local socket (verified empirically: kill the
 * pod-side connection and the local socket stays open forever), so we
 * watch the underlying apiserver WebSocket ourselves and destroy the
 * local socket when it dies — otherwise clients can never detect pod
 * restarts through the tunnel.
 */
import * as net from "node:net";
import * as k8s from "@kubernetes/client-node";

export interface Tunnel {
  localPort: number;
  close(): void;
}

export async function openTunnel(
  kc: k8s.KubeConfig,
  namespace: string,
  podName: string,
  targetPort: number,
): Promise<Tunnel> {
  const forward = new k8s.PortForward(kc);
  const server = net.createServer((socket) => {
    forward
      .portForward(namespace, podName, [targetPort], socket, null, socket)
      .then((wsOrFactory) => {
        // Resolve the apiserver-side WebSocket carrying this connection.
        const ws = typeof wsOrFactory === "function" ? wsOrFactory() : wsOrFactory;
        if (ws && typeof (ws as { on?: unknown }).on === "function") {
          const w = ws as { on(event: string, cb: (...args: unknown[]) => void): void };
          w.on("close", () => socket.destroy());
          w.on("error", () => socket.destroy());
        }
      })
      .catch((err) => {
        socket.destroy(err instanceof Error ? err : new Error(String(err)));
      });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as net.AddressInfo;
  return {
    localPort: address.port,
    close: () => server.close(),
  };
}
