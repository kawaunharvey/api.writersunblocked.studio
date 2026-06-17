import { IsString } from "class-validator";

export class TranslateToPlatformDtoL {
  @IsString()
  body!: string;
}
