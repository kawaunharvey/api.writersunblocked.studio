import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";
import {
  EmitInterrogateCompleteSuccess,
  EmitOnboardToPlatformData,
} from "./storyboard.types";

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: "/storyboard",
})
export class StoryboardGateway {
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(StoryboardGateway.name);

  afterInit(server: Namespace) {
    this.logger.log("Progress gateway initialized on namespace /storyboard");

    server.use((socket, next) => {
      const transport = socket.conn.transport.name;
      const origin = socket.handshake.headers.origin ?? "unknown";
      const address = socket.handshake.address ?? "unknown";

      this.logger.debug(
        `Namespace handshake for socket ${socket.id} via ${transport} from ${origin} (${address})`,
      );

      next();
    });

    server.server.engine.on("connection_error", (error: any) => {
      const req = error?.req;
      const origin = req?.headers?.origin ?? "unknown";
      const url = req?.url ?? "unknown";

      this.logger.error(
        `Socket engine connection error: ${error?.code ?? "unknown"} ${error?.message ?? "unknown"} origin=${origin} url=${url}`,
      );
    });
  }

  private resolveStoryId(payload: unknown): string | null {
    if (typeof payload === "string" && payload.trim()) {
      return payload.trim();
    }

    if (payload && typeof payload === "object" && "storyId" in payload) {
      const storyId = (payload as { storyId?: unknown }).storyId;
      if (typeof storyId === "string" && storyId.trim()) {
        return storyId.trim();
      }
    }

    return null;
  }

  private resolveStoryIdFromHandshake(client: Socket): string | null {
    const queryStoryId = client.handshake.query.storyId;
    if (typeof queryStoryId === "string" && queryStoryId.trim()) {
      return queryStoryId.trim();
    }

    if (Array.isArray(queryStoryId)) {
      const first = queryStoryId.find(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      );
      return first?.trim() ?? null;
    }

    return null;
  }

  private joinStoryRoom(client: Socket, storyId: string) {
    client.join(storyId);
    this.logger.debug(`Socket ${client.id} joined story room ${storyId}`);
  }

  handleConnection(client: Socket) {
    const transport = client.conn.transport.name;
    const origin = client.handshake.headers.origin ?? "unknown";
    const address = client.handshake.address ?? "unknown";
    const userAgent = client.handshake.headers["user-agent"] ?? "unknown";

    this.logger.log(
      `Socket connected ${client.id} via ${transport} from ${origin} (${address}) user-agent=${userAgent}`,
    );

    client.conn.on("upgrade", () => {
      this.logger.debug(
        `Socket ${client.id} upgraded transport to ${client.conn.transport.name}`,
      );
    });

    client.conn.on("close", (reason) => {
      this.logger.debug(`Socket transport closed for ${client.id}: ${reason}`);
    });

    client.conn.on("error", (error: Error) => {
      this.logger.error(
        `Socket transport error for ${client.id}: ${error.message}`,
      );
    });

    const storyId = this.resolveStoryIdFromHandshake(client);
    if (storyId) {
      this.joinStoryRoom(client, storyId);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.warn(`Socket disconnected ${client.id}`);
  }

  emitOnboardComplete(storyId: string): void {
    this.logger.debug(`Emitting onboarding:complete for story=${storyId}`);
    this.server.to(storyId).emit("onboard", { storyId });
  }

  emitPlatformComplete(storyId: string, data: EmitOnboardToPlatformData) {
    this.logger.debug(`Emitting platform for story=${storyId}`);
    this.server.to(storyId).emit("platform", { storyId, data });
  }

  emitInterrogateComplete(
    storyId: string,
    data: EmitInterrogateCompleteSuccess,
  ) {
    this.logger.debug(`Emitting interrogate for story=${storyId}`);
    this.server.to(storyId).emit("interrogate", { storyId, data });
  }

  @SubscribeMessage("join-story")
  handleJoinStory(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    const storyId =
      this.resolveStoryId(body) ?? this.resolveStoryIdFromHandshake(client);

    if (!storyId) {
      this.logger.warn(
        `Socket ${client.id} attempted join-story without storyId`,
      );
      return { ok: false };
    }

    this.joinStoryRoom(client, storyId);
    return { ok: true };
  }
}
