/**
 * This file defines Common objects shared by the Server (backend) and Client (frontend)
 *
 * Types/Interfaces added here make sure there's always consistency in the objects transferred
 * via websockets as well as locally stored or accessed.
 */

// server -> client
export interface ServerStatusType {
  clientsCount: number,
  isRunning: boolean,
  opQueueFull: boolean,
}

// client -> server
export declare type OpCodeType = 0 | 1;

export interface RequestType {
  opCode: OpCodeType,         // 0: related, 1: query
  opQuery: string,            // e.g. 'github/roadmap', or 'nlp', ...
  maxResults: number,         // default = 250
  limitStarsPerUser: number,  // default = 200
  increaseSNR: boolean,       // if true, filter-out doc-only projects, or non-org projects. will also increase false negatives
  starsHistory: boolean,      // if true, slowly fetch all stars for the repos (default: false)
  admin?: RequestAdminType,
}

export interface RequestAdminType {
  invalidateSubject?: boolean,
}

// server[] -> client
export interface OperationType {
  uid: string,
  request: RequestType,
  progress: ProgressType,
  funnel: FunnelType[],
  filters: string[],
  ratings?: HeroRatingsType,
  outputs: OutputRefType[],
  reqByUid: string,
}

export interface ProgressType {
  state: number,            // 0: queued, 1: started, 2: done
  t_q: number,              // unix time: queued
  t_s: number,              // unix time: started
  t_e: number,              // unix time: ended
  p_i: PhaseType,           // phase index 0, or [1 ... p_c ]
  p_c: number,              // phases count
  p: number,                // progress (0 ... 1)
  error?: string,           // if this is set while done, this will contain the details about the error
}

export interface FunnelType {
  size: number,
  stage: string,
  source: string,
}

export interface HeroRatingsType {
  rating: number,
  r_size: number,
  r_growth: number,
  r_engagement: number,
  r_leverage: number,
  r_competitive: number,
}


export interface OutputRefType {
  format: string,
  rows: number,
  cols: number,
  size: number,
  key: string,
}

// constants
export enum PhaseType {
  ResolveInput = 1,
  ResolveComparisons = 2,
  SkimComparisons = 3,
  AugmentData = 4,
  TopicsStats = 5,
  Stats = 6,
}