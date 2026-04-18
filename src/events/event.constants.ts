// Event group names
export const EVENT_GROUP = {
  AI: 'ai',
  SIMULATION: 'simulation',
  BLOCK_ANALYSIS: 'block_analysis',
} as const;

export type EventGroup = (typeof EVENT_GROUP)[keyof typeof EVENT_GROUP];

// Fully-qualified event type strings
export const EVENT_TYPE = {
  // AI provider call lifecycle
  AI_CALL_STARTED: 'ai.call.started',
  AI_CALL_COMPLETED: 'ai.call.completed',
  AI_CALL_FAILED: 'ai.call.failed',

  // Simulation run lifecycle
  SIMULATION_RUN_STARTED: 'simulation.run.started',
  SIMULATION_RUN_CACHE_HIT: 'simulation.run.cache_hit',
  SIMULATION_RUN_COMPLETED: 'simulation.run.completed',
  SIMULATION_RUN_FAILED: 'simulation.run.failed',

  // Block analysis lifecycle
  BLOCK_ANALYSIS_QUEUED: 'block.analysis.queued',
  BLOCK_ANALYSIS_COMPLETED: 'block.analysis.completed',
  BLOCK_ANALYSIS_FAILED: 'block.analysis.failed',
} as const;

export type EventType = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE];
