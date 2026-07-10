import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import type { AnalysisCompleteEvent } from './story-intelligence.types';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/intelligence',
})
export class StoryIntelligenceGateway {
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(StoryIntelligenceGateway.name);

  afterInit(server: Namespace) {
    this.logger.log('Intelligence gateway initialized on namespace /intelligence');

    server.use((socket, next) => {
      next();
    });
  }

  private resolveStoryId(payload: unknown): string | null {
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim();
    }

    if (payload && typeof payload === 'object' && 'storyId' in payload) {
      const storyId = (payload as { storyId?: unknown }).storyId;
      if (typeof storyId === 'string' && storyId.trim()) {
        return storyId.trim();
      }
    }

    return null;
  }

  private resolveStoryIdFromHandshake(client: Socket): string | null {
    const queryStoryId = client.handshake.query.storyId;
    if (typeof queryStoryId === 'string' && queryStoryId.trim()) {
      return queryStoryId.trim();
    }

    if (Array.isArray(queryStoryId)) {
      const first = queryStoryId.find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      );
      return first?.trim() ?? null;
    }

    return null;
  }

  private joinStoryRoom(client: Socket, storyId: string) {
    client.join(storyId);
    this.logger.debug(`Socket ${client.id} joined intelligence room ${storyId}`);
  }

  handleConnection(client: Socket) {
    const storyId = this.resolveStoryIdFromHandshake(client);
    if (storyId) {
      this.joinStoryRoom(client, storyId);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Intelligence socket disconnected ${client.id}`);
  }

  emitAnalysisComplete(event: AnalysisCompleteEvent): void {
    this.logger.debug(
      `Emitting analysis:complete story=${event.storyId} scene=${event.sceneId ?? 'n/a'} created=${event.threadsCreated}`,
    );
    this.server.to(event.storyId).emit('analysis:complete', event);
  }

  emitContextUpdated(event: { storyId: string; sceneId?: string }): void {
    this.logger.debug(`Emitting context:updated story=${event.storyId}`);
    this.server.to(event.storyId).emit('context:updated', event);
  }

  @SubscribeMessage('join-story')
  handleJoinStory(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    const storyId =
      this.resolveStoryId(body) ?? this.resolveStoryIdFromHandshake(client);

    if (!storyId) {
      return { ok: false };
    }

    this.joinStoryRoom(client, storyId);
    return { ok: true };
  }
}
