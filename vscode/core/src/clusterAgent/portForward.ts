/**
 * Local TCP listener tunneling to a pod port via the Kubernetes
 * port-forward subresource — programmatic `kubectl port-forward`.
 * Used when the extension host has no route to cluster service DNS
 * (the normal laptop-to-cluster case).
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
    forward.portForward(namespace, podName, [targetPort], socket, null, socket).catch((err) => {
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
