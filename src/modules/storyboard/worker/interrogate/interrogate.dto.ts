import { IsArray, IsString } from "class-validator";

export class InterrogateQueryDto {
  @IsString()
  body!: string;

  @IsArray()
  questions!: string[];
}
