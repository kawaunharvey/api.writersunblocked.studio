import { IsOptional, IsString } from 'class-validator'

export class CreateStoryboardNoteDto {
  @IsString()
  sceneId!: string;

  @IsString()
  body!: string;
}

export class UpdateStoryboardNoteDto {
  @IsOptional()
  @IsString()
  body?: string;
}
