import { Logger } from '@nestjs/common'
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets'
import { Namespace, Socket } from 'socket.io'

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/progress',
})
export class ProgressGateway {
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(ProgressGateway.name);

  afterInit(server: Namespace) {
    this.logger.log('Progress gateway initialized on namespace /progress');

    server.use((socket, next) => {
      const transport = socket.conn.transport.name;
      const origin = socket.handshake.headers.origin ?? 'unknown';
      const address = socket.handshake.address ?? 'unknown';

      this.logger.debug(
        `Namespace handshake for socket ${socket.id} via ${transport} from ${origin} (${address})`,
      );

      next();
    });

    server.server.engine.on('connection_error', (error: any) => {
      const req = error?.req;
      const origin = req?.headers?.origin ?? 'unknown';
      const url = req?.url ?? 'unknown';

      this.logger.error(
        `Socket engine connection error: ${error?.code ?? 'unknown'} ${error?.message ?? 'unknown'} origin=${origin} url=${url}`,
      );
    });
  }

  handleConnection(client: Socket) {
    const transport = client.conn.transport.name;
    const origin = client.handshake.headers.origin ?? 'unknown';
    const address = client.handshake.address ?? 'unknown';
    const userAgent = client.handshake.headers['user-agent'] ?? 'unknown';

    this.logger.log(
      `Socket connected ${client.id} via ${transport} from ${origin} (${address}) user-agent=${userAgent}`,
    );

    client.conn.on('upgrade', () => {
      this.logger.debug(`Socket ${client.id} upgraded transport to ${client.conn.transport.name}`);
    });

    client.conn.on('close', (reason) => {
      this.logger.debug(`Socket transport closed for ${client.id}: ${reason}`);
    });

    client.conn.on('error', (error: Error) => {
      this.logger.error(`Socket transport error for ${client.id}: ${error.message}`);
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.warn(`Socket disconnected ${client.id}`);
  }

  emitBlockAnalyzed(
    storyId: string,
    blockId: string,
    threadsCreated: number,
    diagnostics?: {
      reason:
        | 'success'
        | 'no_reference_occurrences'
        | 'references_below_threshold'
        | 'analyzer_returned_empty'
        | 'threads_filtered_by_confidence';
      totalOccurrences: number;
      explicitOccurrences: number;
      inferredOccurrences: number;
      selectedOccurrences: number;
      extractionCount: number;
      minInferredConfidence: number;
    },
  ): void {
    this.logger.debug(
      `Emitting block:analyzed for story=${storyId} block=${blockId} threadsCreated=${threadsCreated}`,
    );
    this.server.to(storyId).emit('block:analyzed', {
      blockId,
      storyId,
      threadsCreated,
      diagnostics,
    });
  }

  emitDreamThreadsUpdated(storyId: string): void {
    this.logger.debug(`Emitting dreamthreads:updated for story=${storyId}`);
    this.server.to(storyId).emit('dreamthreads:updated', { storyId });
  }

  emitOnboardingComplete(storyId: string): void {
    this.logger.debug(`Emitting onboarding:complete for story=${storyId}`);
    this.server.to(storyId).emit('onboarding:complete', { storyId });
  }

  @SubscribeMessage('join-story')
  handleJoinStory(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { storyId: string },
  ) {
    if (!body?.storyId) {
      this.logger.warn(`Socket ${client.id} attempted join-story without storyId`);
      return { ok: false };
    }

    client.join(body.storyId);
    this.logger.debug(`Socket ${client.id} joined story room ${body.storyId}`);
    return { ok: true };
  }
}
