import { IsOptional, IsString } from "class-validator";

export class CreateNoteDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  sceneId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsString()
  color!: string;
}

export class GetNoteDto {
  @IsString()
  noteText!: string;

  @IsString()
  storyId!: string;
}
