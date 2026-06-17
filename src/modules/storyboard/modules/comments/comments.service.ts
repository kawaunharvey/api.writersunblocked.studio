import { PrismaService } from "@/database/prisma.service"
import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) { }

  private isValidStoryId(storyId:string) {
    if(!storyId) return false;
    if(storyId === "") return false;
    return Boolean(storyId)
  }

  private async isValidStory(storyId: string) {
    if(!this.isValidStoryId(storyId)) throw new Error('invalid storyId')
    const story = await this.prisma.story.findUnique({
      where: { id: storyId }
    })
    if(!story) throw new Error('Story does not exist')
    return Boolean(story)
  }

  async createComment(storyId: string, comment: Prisma.CommentCreateInput) {
      // check if the story is valid
      await this.isValidStory(storyId);

      // create the comment
      const newComment = this.prisma.comment.create({
        data: {
          ...comment,
          story: {
            connect: {
              id: storyId
            }
          }
        }
      })

      return newComment
  }

}
