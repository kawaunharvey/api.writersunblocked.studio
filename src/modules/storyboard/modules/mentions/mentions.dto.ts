import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export const mentionTypes = ["person", "place", "thing", "group"] as const;
export type MentionType = (typeof mentionTypes)[number];

export const mentionStatuses = ["pending", "confirmed"] as const;
export type MentionStatus = (typeof mentionStatuses)[number];

export class CreateMentionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(mentionTypes)
  mentionType?: MentionType;

  @IsOptional()
  @IsIn(mentionStatuses)
  status?: MentionStatus;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsArray()
  aliases?: unknown[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateMentionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(mentionTypes)
  mentionType?: MentionType;

  @IsOptional()
  @IsIn(mentionStatuses)
  status?: MentionStatus;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsArray()
  aliases?: unknown[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  mentionCount?: number;
}

export class ConfirmMentionDto {
  @IsIn(mentionTypes)
  mentionType!: MentionType;
}
