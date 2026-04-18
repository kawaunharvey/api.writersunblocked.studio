export type DirectionType =
  | 'Collision'
  | 'Revelation'
  | 'Fracture'
  | 'Escalation'
  | 'Quiet';

export interface CandidateDirection {
  id: string;
  type: DirectionType;
  title: string;
  text: string;
  drives: string[];
  momentumScore: number;
  pecResult: 'pass' | 'fail';
  pecReason: string | null;
  pecType: 'standard' | 'forward_window' | null;
}

export interface SurfacedDirection {
  id: string;
  type: DirectionType;
  title: string;
  text: string;
  drives: string[];
  momentumScore: number;
  pecNote: string;
}

export interface ScopedCharacter {
  characterId: string;
  name: string;
  weightMultiplier: number;
}
