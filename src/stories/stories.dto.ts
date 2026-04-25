import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator'

const STORY_MODES = ['novel', 'screenplay'] as const;

export class CreateStoryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @IsIn(STORY_MODES)
  mode?: (typeof STORY_MODES)[number];

  @IsOptional()
  @IsString()
  penName?: string;
}

export class UpdateStoryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  penName?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  contentJSON?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  wordCount?: number;
}

export class UpdatePassageContentDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  contentJSON?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  wordCount?: number;
}

export class RebuildReferencesDto {
  @IsOptional()
  @IsString()
  storyId?: string;
}
