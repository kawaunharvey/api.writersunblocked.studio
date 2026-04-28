import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CreateStoryboardCommentDto {
  @IsString()
  blockId!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  anchorOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  anchorLength?: number;

  @IsOptional()
  @IsString()
  anchorText?: string;
}

export class UpdateStoryboardCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}

export class ListStoryboardCommentsQueryDto {
  @IsOptional()
  @IsString()
  blockId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeResolved?: 'true' | 'false';
}
