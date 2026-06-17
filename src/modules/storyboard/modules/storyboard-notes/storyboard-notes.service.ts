import { PrismaService } from "@/database/prisma.service";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CreateStoryboardNoteDto,
  UpdateStoryboardNoteDto,
} from "./storyboard-notes.dto";

@Injectable()
export class StoryboardNotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) throw new NotFoundException("Story not found");
    if (story.userId !== userId) throw new ForbiddenException();
    return story;
  }

  private async assertNoteOwnership(noteId: string, userId: string) {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      include: { story: true },
    });

    if (!note) throw new NotFoundException("Storyboard note not found");
    if (note.story.userId !== userId) throw new ForbiddenException();
    return note;
  }

  async list(storyId: string, userId: string) {
    await this.assertStoryOwnership(storyId, userId);
    return this.prisma.note.findMany({
      where: { storyId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(storyId: string, userId: string, dto: CreateStoryboardNoteDto) {
    await this.assertStoryOwnership(storyId, userId);

    const note = await this.prisma.note.create({
      data: {
        storyId,
        sceneId: dto.sceneId,
        body: dto.body,
      },
    });

    return note;
  }

  async update(
    storyId: string,
    noteId: string,
    userId: string,
    dto: UpdateStoryboardNoteDto,
  ) {
    await this.assertStoryOwnership(storyId, userId);
    const note = await this.assertNoteOwnership(noteId, userId);

    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data: {
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
    });

    return updated;
  }
}
