import { Type } from 'class-transformer'
import { IsObject, IsString, ValidateNested } from 'class-validator'

export class OnboardingAnswersDto {
  @IsString()
  setting!: string;

  @IsString()
  era!: string;

  @IsString()
  magicOrTech!: string;

  @IsString()
  characters!: string;

  @IsString()
  relationships!: string;

  @IsString()
  conflict!: string;

  @IsString()
  plotBeats!: string;
}

export class StartOnboardingDto {
  @IsObject()
  @ValidateNested()
  @Type(() => OnboardingAnswersDto)
  answers!: OnboardingAnswersDto;
}
