export type Role = 'author' | 'examiner' | 'viewer'

export interface Claim {
  id: string
  number: number
  title: string
  text: string
  independent: boolean
}

export interface Paragraph {
  id: string
  section: string
  text: string
}

export interface Feature {
  id: string
  claimId: string
  label: string
  text: string
  parentId: string | null
  referenceIds: string[]
  supportIds: string[]
  ownerRole: Role
}

export interface Annotation {
  id: string
  featureId: string
  authorRole: Role
  authorName: string
  text: string
  updatedAt: string
}

export interface OrphanMapping {
  id: string
  featureLabel: string
  paragraphId: string
  reason: string
}

export interface ClaimVersion {
  id: string
  name: string
  createdAt: string
  claims: Claim[]
  features: Feature[]
}

export interface Position {
  tab: string
  claimId: string
  featureId: string | null
  scrollY: number
  caseId: string
}

export type CaseKind = 'parent' | 'divisional'
export type HandoffStatus = 'idle' | 'running' | 'done' | 'failed'
export type PendingBasisStatus = 'pending' | 'resolved' | 'discarded'

export interface CaseSlice {
  claims: Claim[]
  paragraphs: Paragraph[]
  features: Feature[]
  annotations: Annotation[]
  orphanMappings: OrphanMapping[]
  versions: ClaimVersion[]
  selectedClaimId: string
  selectedFeatureId: string | null
  activeTab: string
}

export interface PendingBasis {
  id: string
  featureId: string
  featureLabel: string
  paragraphId: string
  paragraphSection: string
  reason: string
  status: PendingBasisStatus
  resolution?: 'repointed' | 'discarded'
  repointedTo?: string
}

export interface DivisionalCase {
  id: string
  name: string
  parentCaseId: string
  splitKey: string
  claimIds: string[]
  createdAt: string
  handoffStatus: HandoffStatus
  handoffError?: string
  handoffAttempts: number
  pendingBasis: PendingBasis[]
  slice: CaseSlice
}

export interface WorkbenchState {
  claims: Claim[]
  paragraphs: Paragraph[]
  features: Feature[]
  annotations: Annotation[]
  orphanMappings: OrphanMapping[]
  versions: ClaimVersion[]
  role: Role
  selectedClaimId: string
  selectedFeatureId: string | null
  activeTab: string
  currentUserRole: Role
  activeCaseId: string
  parentSlice: CaseSlice
  divisionalCases: DivisionalCase[]
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning'
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature'
  featureId?: string
  title: string
  detail: string
}
