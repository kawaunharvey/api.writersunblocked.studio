export interface AnalyzerJobInput {
  storyId: string;
  userId: string;
  sceneIndex: number;
  totalScenes: number;
  text: string;
}

export interface CharacterObservation {
  name: string;
  observedDesire: string;
  observedFear: string;
  objective: string;
  superObjective: string;
  behaviorObservations: string[];
  emotionalState: string;
  relationships: Record<string, string>;
  customTags: string[];
}

export interface CharacterAnalyzerPayload {
  sceneIndex: number;
  characters: CharacterObservation[];
  pecFlags: string[];
}

export interface PlotAnalyzerPayload {
  sceneIndex: number;
  openedThreads: string[];
  advancedThreads: string[];
  resolvedThreads: string[];
  causality: string[];
  momentumIndicators: string[];
  pecFlags: string[];
}

export interface SettingAnalyzerPayload {
  sceneIndex: number;
  locations: string[];
  timeMarkers: string[];
  atmosphere: string;
  worldRules: string[];
  pecFlags: string[];
}

export interface ContinuityPayload {
  sceneIndex: number;
  contradictions: string[];
  summary: string;
}

export interface RememberedPastSnapshot {
  storyId: string;
  sceneIndex: number;
  version: string;
  characters: CharacterObservation[];
  openThreads: string[];
  locations: string[];
  contradictions: string[];
  generatedAt: string;
}
