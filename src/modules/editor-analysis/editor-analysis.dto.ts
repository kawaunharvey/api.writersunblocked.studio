import { IsNotEmpty, IsString } from 'class-validator';

export class AnalyzeSceneDto {
  @IsString()
  @IsNotEmpty()
  plainText!: string;
}

export class LineEditorRespondDto {
  @IsString()
  @IsNotEmpty()
  userInput!: string;
}
