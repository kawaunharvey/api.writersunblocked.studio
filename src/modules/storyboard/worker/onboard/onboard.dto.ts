import { Mention, Note, Scene } from "@prisma/client";
import { IsArray, IsOptional } from "class-validator";

export class OnboardToPlatform {
  @IsOptional()
  @IsArray()
  mentions?: Mention[];

  @IsOptional()
  @IsArray()
  notes?: Note[];

  @IsOptional()
  @IsArray()
  scenes?: Scene[];
}
