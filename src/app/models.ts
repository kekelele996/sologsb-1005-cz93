export type Role = 'author' | 'examiner' | 'viewer'
export type CaseKind = 'parent' | 'divisional'
export type SplitHandoffStatus = 'prepared' | 'linked' | 'failed'
export type PendingSupportStatus = 'pending' | 'confirmed' | 'rejected'

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
}

export interface PendingSupport {
  id: string
  featureId: string
  sourceParagraphId: string
  sourceSection: string
  sourceText: string
  targetParagraphId: string | null
  status: PendingSupportStatus
  reason: string
  createdAt: string
  resolvedAt?: string
}

export interface SplitPackage {
  manifestKey: string
  sourceCaseId: string
  sourceCaseName: string
  selectedClaimIds: string[]
  claims: Claim[]
  features: Feature[]
  annotations: Annotation[]
  sourceParagraphs: Paragraph[]
  createdAt: string
}

export interface CaseSummary {
  id: string
  name: string
  kind: CaseKind
  createdAt: string
  sourceCaseId?: string
  manifestKey?: string
}

export interface WorkbenchState {
  caseId: string
  caseName: string
  caseKind: CaseKind
  sourceCaseId?: string
  manifestKey?: string
  handoffStatus?: SplitHandoffStatus
  linkedAt?: string
  splitPackage?: SplitPackage
  pendingSupports: PendingSupport[]
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
}

export interface SplitResult {
  ok: boolean
  caseId: string
  status: SplitHandoffStatus
  message: string
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning'
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature' | 'pending-support'
  featureId?: string
  title: string
  detail: string
}
