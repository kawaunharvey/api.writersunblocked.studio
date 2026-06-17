import { IsString } from "class-validator";

export class TranslateToPlatformDto {
  @IsString()
  body!: string;
}
