import { PrismaService } from "@/database/prisma.service";
import { Injectable } from "@nestjs/common";
import { CreateNoteDto } from "./notes.dto";

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  private isValidStoryId(storyId: string) {
    if (!storyId) return false;
    if (storyId === "") return false;
    return Boolean(storyId);
  }

  private async isValidStory(storyId: string) {
    if (!this.isValidStoryId(storyId)) throw new Error("invalid storyId");
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) throw new Error("Story does not exist");
    return Boolean(story);
  }

  async create(
    storyId: string,
    userId: string,
    { sceneId, ...note }: CreateNoteDto,
  ) {
    // check if the story is valid
    await this.isValidStory(storyId);

    // create the note
    const newNote = this.prisma.note.create({
      data: {
        ...note,
        story: {
          connect: {
            id: storyId,
          },
        },
        scene: sceneId
          ? {
              connect: { id: sceneId },
            }
          : undefined,
      },
    });

    return newNote;
  }
}
