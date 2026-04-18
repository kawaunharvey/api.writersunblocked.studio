import { IsString, IsOptional, IsNumber, IsArray, Min, Max } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  name: string;

  @IsString()
  initials: string;

  @IsString()
  color: string;

  @IsOptional()
  @IsString()
  seedPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  weight?: number;

  @IsOptional()
  @IsString()
  superObjective?: string;

  @IsOptional()
  @IsString()
  coreFear?: string;
}

export class UpdateCharacterDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  initials?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  seedPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  weight?: number;

  @IsOptional()
  @IsString()
  superObjective?: string;

  @IsOptional()
  @IsString()
  coreFear?: string;

  @IsOptional()
  @IsArray()
  aliases?: Array<{ text: string; context?: string; addedAt: string }>;

  @IsOptional()
  @IsArray()
  customTags?: unknown[];
}

export class AddAliasDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  context?: string;
}
