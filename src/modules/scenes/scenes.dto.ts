import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateSceneDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateSceneDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateSceneNoteDto {
  @IsString()
  content?: string;
}

export class UpdateSceneNoteDto {
  @IsOptional()
  @IsString()
  content?: string;
}

export class SetSceneActiveVersionDto {
  @IsString()
  activeVersionId!: string;
}
