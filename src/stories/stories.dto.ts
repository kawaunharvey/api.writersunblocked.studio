import { IsObject, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class CreateStoryDto {
  @IsOptional()
  @IsString()
  title?: string;

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
