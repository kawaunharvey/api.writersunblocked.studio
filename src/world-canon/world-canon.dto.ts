import { IsObject } from 'class-validator'

export class PatchWorldCanonDto {
  @IsObject()
  rules!: Record<string, unknown>;
}
