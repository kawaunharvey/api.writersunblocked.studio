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

export class AnalyzePlannerDraftDto {
  @IsString()
  draft!: string;
}

export interface PlannerQuestionStatus {
  question: string;
  answered: boolean;
  evidence?: string;
}

export interface PlannerExtractedCharacter {
  name: string;
  description: string;
}

export interface PlannerExtractedLocation {
  name: string;
  description: string;
}

export interface PlannerExtractedPlotline {
  title: string;
  note?: string;
}

export interface AnalyzePlannerDraftResponse {
  wordCount: number;
  thresholdWordCount: number;
  thresholdReached: boolean;
  answeredCount: number;
  thresholdMet: boolean;
  questions: PlannerQuestionStatus[];
  extractedCharacters: PlannerExtractedCharacter[];
  extractedLocations: PlannerExtractedLocation[];
  extractedPlotlines: PlannerExtractedPlotline[];
}
