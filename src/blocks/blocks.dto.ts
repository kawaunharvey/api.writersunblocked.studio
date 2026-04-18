import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator';

export class CreateBlockDto {
  @IsString()
  type: string;

  @IsString()
  content: string;

  @IsObject()
  contentJSON: Record<string, unknown>;

  @IsNumber()
  order: number;

  @IsOptional()
  @IsString()
  passageId?: string;
}

export class UpdateBlockDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  contentJSON?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsString()
  passageId?: string;
}
