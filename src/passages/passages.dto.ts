import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePassageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdatePassageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class CreatePassageNoteDto {
  @IsString()
  content: string;
}

export class UpdatePassageNoteDto {
  @IsOptional()
  @IsString()
  content?: string;
}
