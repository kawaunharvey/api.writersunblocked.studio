import { Injectable } from '@nestjs/common';

@Injectable()
export class MomentumService {
  score(input: {
    tensionPotential: number;
    unresolvedThreadCount: number;
    arcProgression: number;
    currentSceneThreadBoost?: number;
    promotedPathBoost?: number;
  }): number {
    const currentSceneThreadBoost = input.currentSceneThreadBoost ?? 0;
    const promotedPathBoost = input.promotedPathBoost ?? 0;

    const raw =
      input.tensionPotential * 0.4 +
      Math.min(input.unresolvedThreadCount, 6) * 8 +
      input.arcProgression * 0.25 +
      currentSceneThreadBoost +
      promotedPathBoost;

    return Math.max(0, Math.min(100, Math.round(raw)));
  }
}
