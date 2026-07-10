import { IsIn, IsOptional, IsString } from 'class-validator';

export const platformInputTypes = ['input', 'note', 'comment', 'link'] as const;
export type PlatformInputTypeDto = (typeof platformInputTypes)[number];

export class CreatePlatformPostDto {
  @IsIn(platformInputTypes)
  platformType!: PlatformInputTypeDto;

  @IsString()
  body!: string;

  @IsOptional()
  content?: unknown;

  @IsOptional()
  @IsString()
  color?: string;
}

export class RejectPlatformItemDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
