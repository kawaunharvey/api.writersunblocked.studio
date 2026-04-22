import { IsOptional, IsString } from 'class-validator'

export class CreateStoryboardNoteDto {
  @IsString()
  passageId!: string;

  @IsString()
  body!: string;
}

export class UpdateStoryboardNoteDto {
  @IsOptional()
  @IsString()
  body?: string;
}
