import { Injectable, OnDestroy } from '@angular/core'
import { BehaviorSubject, map, type Observable } from 'rxjs'
import type {
  Annotation,
  CaseSummary,
  Claim,
  ClaimVersion,
  Feature,
  Paragraph,
  PendingSupport,
  Position,
  Role,
  SplitPackage,
  SplitResult,
  ValidationIssue,
  WorkbenchState
} from './models'

const LEGACY_STORAGE_KEY = 'patent-claim-mapping-workbench-v1'
const REGISTRY_KEY = 'patent-claim-mapping-cases-v2'
const ACTIVE_CASE_KEY = 'patent-claim-mapping-active-case-v2'
const POSITION_PREFIX = 'patent-claim-mapping-position-v2'
const PARENT_CASE_ID = 'CN-2026-0917'

const initialClaims: Claim[] = [
  { id: 'claim-1', number: 1, title: '一种自适应展柜环境控制装置', independent: true, text: '一种自适应展柜环境控制装置，包括：柜体；环境传感模块，设置于所述柜体内并用于采集温湿度数据；以及控制模块，与所述环境传感模块通信，并根据所述温湿度数据调节所述柜体的微环境。' },
  { id: 'claim-2', number: 2, title: '传感模块的布置方式', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述环境传感模块包括沿所述柜体对角线布置的多个温湿度传感器。' },
  { id: 'claim-3', number: 3, title: '控制模块的调节策略', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述控制模块基于历史数据与当前数据之间的偏差分级调节除湿单元。' }
]
const initialParagraphs: Paragraph[] = [
  { id: 'para-0012', section: '说明书 [0012]', text: '柜体1形成用于陈列文物的封闭空间。环境传感模块2安装于柜体内部，可采集温度、相对湿度等环境数据，并将数据发送至控制模块3。' },
  { id: 'para-0018', section: '说明书 [0018]', text: '在一种实施方式中，多个温湿度传感器沿柜体对角线布置，由此可降低局部气流造成的测量偏差。传感器数量可根据柜体容积设定。' },
  { id: 'para-0024', section: '说明书 [0024]', text: '控制模块可比较当前湿度与预设区间，并结合历史变化趋势生成调节等级。当偏差持续超过阈值时，控制模块启动除湿单元并提高调节频率。' },
  { id: 'para-0031', section: '说明书 [0031]', text: '控制模块与传感模块之间可以采用有线或无线通信。通信链路可周期传输数据，传输周期例如为十秒至五分钟。' },
  { id: 'para-0040', section: '说明书 [0040]', text: '微环境调节包括湿度调节、温度调节及气体交换。控制策略可记录执行结果，用于后续趋势判断。' }
]
const initialFeatures: Feature[] = [
  { id: 'feature-a', claimId: 'claim-1', label: 'A · 柜体', text: '柜体', parentId: null, referenceIds: [], supportIds: ['para-0012'], ownerRole: 'author' },
  { id: 'feature-b', claimId: 'claim-1', label: 'B · 环境传感模块', text: '设置于柜体内，用于采集温湿度数据', parentId: 'feature-a', referenceIds: [], supportIds: ['para-0012', 'para-0018'], ownerRole: 'author' },
  { id: 'feature-c', claimId: 'claim-1', label: 'C · 控制模块通信', text: '与环境传感模块通信', parentId: 'feature-a', referenceIds: ['feature-b'], supportIds: ['para-0012', 'para-0031'], ownerRole: 'author' },
  { id: 'feature-d', claimId: 'claim-1', label: 'D · 调节微环境', text: '根据温湿度数据调节柜体微环境', parentId: null, referenceIds: ['feature-b', 'feature-c'], supportIds: ['para-0024', 'para-0040'], ownerRole: 'author' },
  { id: 'feature-e', claimId: 'claim-2', label: 'E · 对角线布置', text: '多个温湿度传感器沿柜体对角线布置', parentId: null, referenceIds: [], supportIds: ['para-0018'], ownerRole: 'author' },
  { id: 'feature-f', claimId: 'claim-3', label: 'F · 分级调节', text: '基于历史数据与当前数据的偏差分级调节除湿单元', parentId: null, referenceIds: [], supportIds: ['para-0024'], ownerRole: 'author' }
]
const initialAnnotations: Annotation[] = [
  { id: 'annotation-1', featureId: 'feature-b', authorRole: 'examiner', authorName: '审查员 · 李岚', text: '“温湿度数据”是否包括露点等派生数据？建议在从属权利要求中限定。', updatedAt: '2026-09-24T03:10:00.000Z' },
  { id: 'annotation-2', featureId: 'feature-d', authorRole: 'author', authorName: '代理人 · 陈昊', text: '[0024] 已支持分级调节，发布前补充除湿单元与通信模块的连接关系。', updatedAt: '2026-09-24T04:05:00.000Z' }
]

function parentDemoState(): WorkbenchState {
  return {
    caseId: PARENT_CASE_ID,
    caseName: '母案 CN-2026-0917',
    caseKind: 'parent',
    pendingSupports: [],
    claims: initialClaims,
    paragraphs: initialParagraphs,
    features: initialFeatures,
    annotations: initialAnnotations,
    orphanMappings: [],
    versions: [],
    role: 'author',
    currentUserRole: 'author',
    selectedClaimId: 'claim-1',
    selectedFeatureId: 'feature-b',
    activeTab: 'mapping'
  }
}

function clone<T>(value: T): T { return structuredClone(value) }
function normalizeText(value: string): string { return value.replace(/\s+/g, '').trim() }
function stableKey(values: string[]): string {
  const hash = values.join('|').split('').reduce((result, char) => ((result << 5) - result + char.charCodeAt(0)) | 0, 0)
  return Math.abs(hash).toString(36)
}

@Injectable({ providedIn: 'root' })
export class WorkbenchService implements OnDestroy {
  private readonly caseRecords: CaseSummary[]
  private caseId: string
  private readonly stateSubject: BehaviorSubject<WorkbenchState>
  private readonly historySubject = new BehaviorSubject<{ past: number; future: number }>({ past: 0, future: 0 })
  private readonly casesSubject: BehaviorSubject<CaseSummary[]>
  private past: WorkbenchState[] = []
  private future: WorkbenchState[] = []

  readonly state$: Observable<WorkbenchState>
  readonly history$ = this.historySubject.asObservable()
  readonly cases$: Observable<CaseSummary[]>
  readonly claims$: Observable<Claim[]>
  readonly paragraphs$: Observable<Paragraph[]>
  readonly features$: Observable<Feature[]>
  readonly annotations$: Observable<Annotation[]>
  readonly role$: Observable<Role>
  readonly selectedClaim$: Observable<Claim | undefined>
  readonly selectedFeature$: Observable<Feature | undefined>
  readonly issues$: Observable<ValidationIssue[]>

  constructor() {
    const boot = this.bootstrap()
    this.caseRecords = boot.records
    this.caseId = boot.activeCaseId
    this.stateSubject = new BehaviorSubject<WorkbenchState>(boot.state)
    this.casesSubject = new BehaviorSubject<CaseSummary[]>(clone(this.caseRecords))
    this.state$ = this.stateSubject.asObservable()
    this.cases$ = this.casesSubject.asObservable()
    this.claims$ = this.state$.pipe(map(state => state.claims))
    this.paragraphs$ = this.state$.pipe(map(state => state.paragraphs))
    this.features$ = this.state$.pipe(map(state => state.features))
    this.annotations$ = this.state$.pipe(map(state => state.annotations))
    this.role$ = this.state$.pipe(map(state => state.role))
    this.selectedClaim$ = this.state$.pipe(map(state => state.claims.find(claim => claim.id === state.selectedClaimId) || state.claims[0]))
    this.selectedFeature$ = this.state$.pipe(map(state => state.features.find(feature => feature.id === state.selectedFeatureId)))
    this.issues$ = this.state$.pipe(map(state => this.validate(state)))

    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.savePosition())
    setTimeout(() => this.restoreScroll(), 0)
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', () => this.savePosition())
  }

  get snapshot(): WorkbenchState { return clone(this.stateSubject.value) }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  selectClaim(id: string): void {
    this.patchState(state => { state.selectedClaimId = id; state.selectedFeatureId = state.features.find(feature => feature.claimId === id)?.id || null })
    this.savePosition()
  }

  selectFeature(id: string | null): void {
    this.patchState(state => { state.selectedFeatureId = id })
    this.savePosition()
  }

  setRole(role: Role): void {
    this.patchState(state => { state.role = role; state.currentUserRole = role })
  }

  setTab(tab: string): void {
    this.patchState(state => { state.activeTab = tab })
    this.savePosition()
  }

  openCase(id: string): void {
    if (id === this.caseId) return
    this.savePosition()
    const record = this.caseRecords.find(item => item.id === id)
    if (!record) return
    this.caseId = id
    this.past = []
    this.future = []
    const state = this.loadCaseState(record)
    this.stateSubject.next(state)
    this.updateHistory()
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_CASE_KEY, id)
    setTimeout(() => this.restoreScroll(), 0)
  }

  updateClaim(patch: Partial<Claim>): void {
    this.commit(state => {
      const claim = state.claims.find(item => item.id === state.selectedClaimId)
      if (claim) Object.assign(claim, patch)
    })
  }

  addClaim(): void {
    this.commit(state => {
      const number = Math.max(0, ...state.claims.map(claim => claim.number)) + 1
      const claim: Claim = { id: `claim-${Date.now()}`, number, title: `权利要求 ${number}`, independent: false, text: '请录入权利要求正文。' }
      state.claims.push(claim)
      state.selectedClaimId = claim.id
      state.selectedFeatureId = null
    })
  }

  addParagraph(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const next = state.paragraphs.length + 1
      state.paragraphs.push({ id: `para-${Date.now()}`, section: `说明书 [${String(next * 5).padStart(4, '0')}]`, text: '' })
    })
  }

  updateParagraph(id: string, patch: Partial<Paragraph>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const paragraph = state.paragraphs.find(item => item.id === id)
      if (paragraph) Object.assign(paragraph, patch)
    })
  }

  deleteParagraph(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      state.paragraphs = state.paragraphs.filter(item => item.id !== id)
      state.features.forEach(feature => { feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== id) })
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== id)
      state.pendingSupports.forEach(item => {
        if (item.targetParagraphId !== id) return
        item.targetParagraphId = null
        if (item.status === 'confirmed') {
          item.status = 'pending'
          item.reason = '原先确认的分案段落已删除，请重新指定正文一致的段落。'
          item.resolvedAt = undefined
        }
      })
    })
  }

  addFeature(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature: Feature = {
        id: `feature-${Date.now()}`, claimId: state.selectedClaimId,
        label: `新特征 ${state.features.filter(item => item.claimId === state.selectedClaimId).length + 1}`,
        text: '', parentId: null, referenceIds: [], supportIds: [], ownerRole: state.role
      }
      state.features.push(feature)
      state.selectedFeatureId = feature.id
    })
  }

  updateFeature(id: string, patch: Partial<Feature>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (feature) Object.assign(feature, patch)
    })
  }

  deleteFeature(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (!feature) return
      feature.supportIds.forEach(paragraphId => state.orphanMappings.push({
        id: `orphan-${Date.now()}-${paragraphId}`, featureLabel: feature.label, paragraphId,
        reason: `技术特征“${feature.label}”已删除，但支持段落映射仍被保留。`
      }))
      state.features = state.features.filter(item => item.id !== id)
      state.features.forEach(item => {
        item.referenceIds = item.referenceIds.filter(refId => refId !== id)
        if (item.parentId === id) item.parentId = null
      })
      state.annotations = state.annotations.filter(item => item.featureId !== id)
      state.pendingSupports = state.pendingSupports.filter(item => item.featureId !== id)
      state.selectedFeatureId = state.features.find(item => item.claimId === state.selectedClaimId)?.id || null
    })
  }

  toggleParagraphMapping(featureId: string, paragraphId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === featureId)
      if (!feature) return
      const index = feature.supportIds.indexOf(paragraphId)
      if (index >= 0) {
        feature.supportIds.splice(index, 1)
        const linked = state.pendingSupports.find(item => item.featureId === featureId && item.targetParagraphId === paragraphId && item.status === 'confirmed')
        if (linked) {
          linked.status = 'pending'
          linked.targetParagraphId = null
          linked.resolvedAt = undefined
          linked.reason = '映射已手动取消，依据退回待确认。'
        }
      } else {
        feature.supportIds.push(paragraphId)
        const pending = state.pendingSupports.find(item => item.featureId === featureId && item.status === 'pending')
        if (pending && pending.targetParagraphId === paragraphId) this.confirmPending(state, pending, paragraphId)
      }
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== paragraphId)
    })
  }

  clearOrphan(id: string): void {
    this.commit(state => { state.orphanMappings = state.orphanMappings.filter(item => item.id !== id) })
  }

  addAnnotation(featureId: string, text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    const role = this.stateSubject.value.role
    const names: Record<Role, string> = { author: '代理人 · 陈昊', examiner: '审查员 · 李岚', viewer: '观察者' }
    this.commit(state => state.annotations.push({
      id: `annotation-${Date.now()}`, featureId, authorRole: role, authorName: names[role], text: trimmed, updatedAt: new Date().toISOString()
    }))
  }

  updateAnnotation(id: string, text: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) annotation.text = text
    })
  }

  deleteAnnotation(id: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) state.annotations = state.annotations.filter(item => item.id !== id)
    })
  }

  createVersion(name?: string): void {
    this.commit(state => {
      state.versions.unshift({
        id: `version-${Date.now()}`, name: name?.trim() || `快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        createdAt: new Date().toISOString(), claims: clone(state.claims), features: clone(state.features)
      })
    })
  }

  restoreVersion(id: string): void {
    this.commit(state => {
      const version = state.versions.find(item => item.id === id)
      if (!version) return
      state.claims = clone(version.claims)
      state.features = clone(version.features)
      if (!state.claims.some(claim => claim.id === state.selectedClaimId)) state.selectedClaimId = state.claims[0]?.id || ''
      state.selectedFeatureId = state.features.find(feature => feature.claimId === state.selectedClaimId)?.id || null
    })
  }

  createDivisionalSplit(name: string, selectedClaimIds: string[], simulateFailure = false): SplitResult {
    const parent = this.stateSubject.value
    const trimmedName = name.trim()
    const claimIds = Array.from(new Set(selectedClaimIds)).sort()
    if (parent.caseKind !== 'parent') return { ok: false, caseId: '', status: 'failed', message: '只能从母案发起分案。' }
    if (parent.role !== 'author') return { ok: false, caseId: '', status: 'failed', message: '请切换到代理人后发起分案。' }
    if (!trimmedName) return { ok: false, caseId: '', status: 'failed', message: '请填写分案名称。' }
    if (!claimIds.length) return { ok: false, caseId: '', status: 'failed', message: '请至少选择一项要保留的权利要求。' }

    const selectedClaims = parent.claims.filter(claim => claimIds.includes(claim.id))
    if (selectedClaims.length !== claimIds.length) return { ok: false, caseId: '', status: 'failed', message: '选择的权利要求已不存在，请刷新清单。' }

    const manifestKey = stableKey([parent.caseId, ...claimIds])
    const existing = this.caseRecords.find(record => record.kind === 'divisional' && record.manifestKey === manifestKey && record.sourceCaseId === parent.caseId)
    const caseId = existing?.id || `divisional-${manifestKey}`
    const existingState = existing ? this.readStoredCaseState(caseId) : null
    const shouldFail = simulateFailure || trimmedName.toLowerCase().includes('fail') || trimmedName.includes('失败')

    if (existing && existingState?.handoffStatus === 'linked') {
      this.openCase(existing.id)
      return { ok: true, caseId: existing.id, status: 'linked', message: '该分案清单已衔接，未重复建件；已打开原分案继续核对。' }
    }

    const splitPackage = existingState?.splitPackage || this.buildSplitPackage(parent, claimIds, selectedClaims, manifestKey)
    const splitName = existingState?.caseName || trimmedName
    const state = this.buildDivisionalState(caseId, splitName, parent, splitPackage, shouldFail ? 'failed' : 'linked')

    this.persistCaseState(state)
    this.upsertRecord({
      id: caseId,
      name: splitName,
      kind: 'divisional',
      createdAt: existing?.createdAt || splitPackage.createdAt,
      sourceCaseId: parent.caseId,
      manifestKey
    })
    this.openCase(caseId)

    return shouldFail
      ? { ok: false, caseId, status: 'failed', message: '分案清单已保存，但案件衔接失败；可在分案侧重试，不会重复建件。' }
      : { ok: true, caseId, status: 'linked', message: existingState ? '同一份分案清单重试成功，未重复建件。' : '分案已建立，保留权利要求、特征层级、批注和说明书依据已进入正文对账。' }
  }

  retryHandoff(): SplitResult {
    const current = this.stateSubject.value
    if (current.caseKind !== 'divisional' || !current.splitPackage) return { ok: false, caseId: current.caseId, status: 'failed', message: '当前案件没有可重试的分案衔接清单。' }

    const linked = this.buildDivisionalState(current.caseId, current.caseName, current, current.splitPackage, 'linked')
    this.commit(state => Object.assign(state, linked))
    return { ok: true, caseId: current.caseId, status: 'linked', message: '衔接已恢复，分案清单已重新送入正文对账队列。' }
  }

  confirmPendingSupport(id: string, targetParagraphId?: string | null): void {
    this.commit(state => {
      const pending = state.pendingSupports.find(item => item.id === id)
      if (!pending || pending.status === 'rejected') return
      const targetId = targetParagraphId || pending.targetParagraphId
      const target = state.paragraphs.find(item => item.id === targetId)
      if (!target || normalizeText(target.text) !== normalizeText(pending.sourceText)) return
      this.confirmPending(state, pending, target.id)
    })
  }

  rejectPendingSupport(id: string): void {
    this.commit(state => {
      const pending = state.pendingSupports.find(item => item.id === id)
      if (!pending || pending.status !== 'pending') return
      pending.status = 'rejected'
      pending.resolvedAt = new Date().toISOString()
      pending.reason = '代理人确认该依据不进入分案。'
      const feature = state.features.find(item => item.id === pending.featureId)
      if (feature && pending.targetParagraphId) {
        const stillConfirmed = state.pendingSupports.some(item => item.id !== id && item.featureId === feature.id && item.status === 'confirmed' && item.targetParagraphId === pending.targetParagraphId)
        if (!stillConfirmed) feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== pending.targetParagraphId)
      }
    })
  }

  reopenPendingSupport(id: string): void {
    this.commit(state => {
      const pending = state.pendingSupports.find(item => item.id === id)
      if (!pending || pending.status === 'pending') return
      const feature = state.features.find(item => item.id === pending.featureId)
      if (feature && pending.targetParagraphId) {
        const stillConfirmed = state.pendingSupports.some(item => item.id !== id && item.featureId === feature.id && item.status === 'confirmed' && item.targetParagraphId === pending.targetParagraphId)
        if (!stillConfirmed) feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== pending.targetParagraphId)
      }
      pending.status = 'pending'
      pending.resolvedAt = undefined
      pending.reason = '段落编号与母案不一致，已按正文匹配到候选段落，请人工确认。'
    })
  }

  setPendingTarget(id: string, targetParagraphId: string | null): void {
    this.commit(state => {
      const pending = state.pendingSupports.find(item => item.id === id)
      if (!pending || pending.status !== 'pending') return
      pending.targetParagraphId = targetParagraphId
    })
  }

  undo(): void {
    const previous = this.past.pop()
    if (!previous) return
    this.future.push(clone(this.stateSubject.value))
    this.stateSubject.next(previous)
    this.updateHistory()
    this.saveState()
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(clone(this.stateSubject.value))
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  savePosition(): void {
    if (typeof localStorage === 'undefined' || typeof window === 'undefined') return
    const state = this.stateSubject.value
    const position: Position = { tab: state.activeTab, claimId: state.selectedClaimId, featureId: state.selectedFeatureId, scrollY: window.scrollY }
    localStorage.setItem(`${POSITION_PREFIX}:${this.caseId}`, JSON.stringify(position))
    this.saveState()
  }

  readPosition(): Position {
    const state = this.stateSubject.value
    const fallback: Position = { tab: state.activeTab, claimId: state.selectedClaimId, featureId: state.selectedFeatureId, scrollY: 0 }
    if (typeof localStorage === 'undefined') return fallback
    try {
      const stored = JSON.parse(localStorage.getItem(`${POSITION_PREFIX}:${this.caseId}`) || '{}') as Partial<Position>
      if (stored.tab === 'split' && state.handoffStatus === 'linked') stored.tab = 'reconciliation'
      return { ...fallback, ...stored }
    } catch { return fallback }
  }

  exportJson(): string { return JSON.stringify({ ...this.snapshot, validationIssues: this.validate(this.stateSubject.value) }, null, 2) }

  exportCsv(): string {
    const state = this.stateSubject.value
    const rows = state.features.map(feature => [
      state.claims.find(claim => claim.id === feature.claimId)?.number || '', feature.label, feature.text,
      state.features.find(item => item.id === feature.parentId)?.label || '',
      feature.referenceIds.map(id => state.features.find(item => item.id === id)?.label || id).join('；'),
      feature.supportIds.map(id => state.paragraphs.find(item => item.id === id)?.section || id).join('；'),
      state.pendingSupports.filter(item => item.featureId === feature.id && item.status === 'pending').length
    ])
    const csv = [['权利要求', '技术特征', '特征内容', '父级特征', '引用特征', '支持段落', '待确认依据'], ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    return `﻿${csv}`
  }

  validate(state = this.stateSubject.value): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const feature of state.features) {
      if (!feature.text.trim()) issues.push({ id: `empty-${feature.id}`, severity: 'warning', type: 'empty-feature', featureId: feature.id, title: `${feature.label} 内容为空`, detail: '请补全技术特征文字，避免映射对象不明确。' })
      if (!feature.supportIds.length) issues.push({ id: `support-${feature.id}`, severity: 'error', type: 'missing-support', featureId: feature.id, title: `${feature.label} 缺少说明书依据`, detail: '至少确认一个说明书段落建立支持映射。' })
      if (this.hasReferenceCycle(feature, state.features)) issues.push({ id: `cycle-${feature.id}`, severity: 'error', type: 'cycle', featureId: feature.id, title: `${feature.label} 存在循环引用`, detail: '特征层级或引用关系形成闭环，请移除其中一条关系。' })
    }
    state.pendingSupports
      .filter(item => item.status === 'pending' && state.features.some(feature => feature.id === item.featureId))
      .forEach(item => {
        const feature = state.features.find(feature => feature.id === item.featureId)
        issues.push({
          id: item.id,
          severity: 'warning',
          type: 'pending-support',
          featureId: item.featureId,
          title: `${feature?.label || '技术特征'} 的依据待确认`,
          detail: `母案 ${item.sourceSection} 与分案段落编号不一致；已按正文找到候选段落，确认前不会把它算作分案依据。`
        })
      })
    state.orphanMappings.forEach(item => issues.push({ id: item.id, severity: 'warning', type: 'orphan-mapping', title: '存在待清理映射', detail: item.reason }))
    return issues
  }

  private hasReferenceCycle(start: Feature, features: Feature[]): boolean {
    const visited = new Set<string>()
    const visit = (id: string): boolean => {
      if (id === start.id && visited.size > 0) return true
      if (visited.has(id)) return false
      visited.add(id)
      const feature = features.find(item => item.id === id)
      if (!feature) return false
      if (feature.parentId && visit(feature.parentId)) return true
      return feature.referenceIds.some(visit)
    }
    return visit(start.id)
  }

  private buildSplitPackage(parent: WorkbenchState, selectedClaimIds: string[], selectedClaims: Claim[], manifestKey: string): SplitPackage {
    const selectedFeatures = parent.features.filter(feature => selectedClaimIds.includes(feature.claimId))
    const featureIds = new Set(selectedFeatures.map(feature => feature.id))
    return {
      manifestKey,
      sourceCaseId: parent.caseId,
      sourceCaseName: parent.caseName,
      selectedClaimIds,
      claims: clone(selectedClaims),
      features: clone(selectedFeatures).map(feature => ({
        ...feature,
        parentId: feature.parentId && featureIds.has(feature.parentId) ? feature.parentId : null,
        referenceIds: feature.referenceIds.filter(id => featureIds.has(id))
      })),
      annotations: clone(parent.annotations.filter(annotation => featureIds.has(annotation.featureId))),
      sourceParagraphs: clone(parent.paragraphs),
      createdAt: new Date().toISOString()
    }
  }

  private buildDivisionalState(caseId: string, name: string, parent: WorkbenchState, splitPackage: SplitPackage, status: 'prepared' | 'linked' | 'failed'): WorkbenchState {
    const state: WorkbenchState = {
      ...parentDemoState(),
      caseId,
      caseName: name,
      caseKind: 'divisional',
      sourceCaseId: parent.caseId,
      manifestKey: splitPackage.manifestKey,
      handoffStatus: status,
      splitPackage: clone(splitPackage),
      claims: [],
      paragraphs: [],
      features: [],
      annotations: [],
      orphanMappings: [],
      pendingSupports: [],
      versions: [],
      role: parent.role,
      currentUserRole: parent.currentUserRole,
      selectedClaimId: '',
      selectedFeatureId: null,
      activeTab: status === 'linked' ? 'reconciliation' : 'split'
    }
    if (status === 'linked') this.applySplitPackage(state)
    return state
  }

  private applySplitPackage(state: WorkbenchState): void {
    const splitPackage = state.splitPackage
    if (!splitPackage) return
    const now = new Date().toISOString()
    state.claims = clone(splitPackage.claims)
    state.paragraphs = splitPackage.sourceParagraphs.map((paragraph, index) => ({
      id: `div-para-${index + 1}`,
      section: `说明书 [${String((index + 1) * 4).padStart(4, '0')}]`,
      text: paragraph.text
    }))
    state.features = clone(splitPackage.features).map(feature => ({ ...feature, supportIds: [] }))
    state.annotations = clone(splitPackage.annotations)
    state.orphanMappings = []
    state.pendingSupports = []
    state.linkedAt = now
    state.handoffStatus = 'linked'
    state.activeTab = 'reconciliation'

    for (const feature of state.features) {
      const sourceFeature = splitPackage.features.find(item => item.id === feature.id)
      for (const sourceId of sourceFeature?.supportIds || []) {
        const source = splitPackage.sourceParagraphs.find(paragraph => paragraph.id === sourceId)
        if (!source) continue
        const target = state.paragraphs.find(paragraph => normalizeText(paragraph.text) === normalizeText(source.text))
        const pending: PendingSupport = {
          id: `pending-${feature.id}-${source.id}`,
          featureId: feature.id,
          sourceParagraphId: source.id,
          sourceSection: source.section,
          sourceText: source.text,
          targetParagraphId: target?.id || null,
          status: 'pending',
          reason: '段落编号与母案不一致，已按正文匹配到候选段落，请人工确认。',
          createdAt: now
        }
        if (target && target.section === source.section && normalizeText(target.text) === normalizeText(source.text)) {
          pending.status = 'confirmed'
          pending.reason = '段落编号与正文均一致，已自动确认。'
          pending.resolvedAt = now
          feature.supportIds.push(target.id)
        }
        state.pendingSupports.push(pending)
      }
    }

    state.selectedClaimId = state.claims[0]?.id || ''
    state.selectedFeatureId = state.features.find(feature => feature.claimId === state.selectedClaimId)?.id || null
  }

  private confirmPending(state: WorkbenchState, pending: PendingSupport, targetParagraphId: string): void {
    const feature = state.features.find(item => item.id === pending.featureId)
    pending.status = 'confirmed'
    pending.targetParagraphId = targetParagraphId
    pending.reason = '正文一致，代理人已确认该分案段落。'
    pending.resolvedAt = new Date().toISOString()
    if (feature && !feature.supportIds.includes(targetParagraphId)) feature.supportIds.push(targetParagraphId)
  }

  private commit(recipe: (state: WorkbenchState) => void): void {
    const current = clone(this.stateSubject.value)
    const next = clone(current)
    recipe(next)
    if (JSON.stringify(current) === JSON.stringify(next)) return
    this.past.push(current)
    if (this.past.length > 60) this.past.shift()
    this.future = []
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  private patchState(recipe: (state: WorkbenchState) => void): void {
    const next = clone(this.stateSubject.value)
    recipe(next)
    this.stateSubject.next(next)
    this.saveState()
  }

  private updateHistory(): void { this.historySubject.next({ past: this.past.length, future: this.future.length }) }
  private saveState(): void { this.persistCaseState(this.stateSubject.value) }

  private persistCaseState(state: WorkbenchState): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(this.caseStorageKey(state.caseId), JSON.stringify(state))
  }

  private caseStorageKey(id: string): string { return `patent-claim-mapping-case-v2:${id}` }
  private positionKey(id: string): string { return `${POSITION_PREFIX}:${id}` }

  private readStoredCaseState(id: string): WorkbenchState | null {
    if (typeof localStorage === 'undefined') return null
    try {
      const stored = localStorage.getItem(this.caseStorageKey(id))
      return stored ? JSON.parse(stored) as WorkbenchState : null
    } catch { return null }
  }

  private restoreScroll(): void {
    if (typeof window === 'undefined') return
    const position = this.readPosition()
    window.scrollTo({ top: position.scrollY || 0, behavior: 'instant' as ScrollBehavior })
  }

  private bootstrap(): { records: CaseSummary[]; activeCaseId: string; state: WorkbenchState } {
    if (typeof localStorage === 'undefined') {
      return { records: [this.parentRecord()], activeCaseId: PARENT_CASE_ID, state: parentDemoState() }
    }

    const storedRegistry = localStorage.getItem(REGISTRY_KEY)
    if (!storedRegistry) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      const state = legacy ? this.normalizeState(parentDemoState(), JSON.parse(legacy)) : parentDemoState()
      localStorage.setItem(this.caseStorageKey(PARENT_CASE_ID), JSON.stringify(state))
      const records = [this.parentRecord()]
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(records))
      localStorage.setItem(ACTIVE_CASE_KEY, PARENT_CASE_ID)
      return { records, activeCaseId: PARENT_CASE_ID, state: this.withPosition(state) }
    }

    let records: CaseSummary[] = []
    try { records = JSON.parse(storedRegistry) } catch { records = [this.parentRecord()] }
    if (!records.some(record => record.id === PARENT_CASE_ID)) records.unshift(this.parentRecord())
    const storedActive = localStorage.getItem(ACTIVE_CASE_KEY)
    const activeCaseId = records.some(record => record.id === storedActive) ? storedActive || PARENT_CASE_ID : PARENT_CASE_ID
    const record = records.find(item => item.id === activeCaseId) || this.parentRecord()
    return { records, activeCaseId, state: this.loadCaseState(record) }
  }

  private parentRecord(): CaseSummary {
    return { id: PARENT_CASE_ID, name: '母案 CN-2026-0917', kind: 'parent', createdAt: '2026-09-24T00:00:00.000Z' }
  }

  private loadCaseState(record: CaseSummary): WorkbenchState {
    if (typeof localStorage === 'undefined') return record.kind === 'parent' ? parentDemoState() : this.buildEmptyDivisional(record)
    try {
      const stored = localStorage.getItem(this.caseStorageKey(record.id))
      const fallback = record.kind === 'parent' ? parentDemoState() : this.buildEmptyDivisional(record)
      const state = stored ? this.normalizeState(fallback, JSON.parse(stored)) : fallback
      if (!stored) this.persistCaseState(state)
      return this.withPosition(state)
    } catch {
      return record.kind === 'parent' ? parentDemoState() : this.buildEmptyDivisional(record)
    }
  }

  private buildEmptyDivisional(record: CaseSummary): WorkbenchState {
    return {
      ...parentDemoState(),
      caseId: record.id,
      caseName: record.name,
      caseKind: 'divisional',
      sourceCaseId: record.sourceCaseId,
      manifestKey: record.manifestKey,
      handoffStatus: 'prepared',
      claims: [],
      paragraphs: [],
      features: [],
      annotations: [],
      orphanMappings: [],
      pendingSupports: [],
      versions: [],
      selectedClaimId: '',
      selectedFeatureId: null,
      activeTab: 'split'
    }
  }

  private normalizeState(fallback: WorkbenchState, stored: Partial<WorkbenchState>): WorkbenchState {
    const state = { ...clone(fallback), ...stored }
    state.pendingSupports ||= []
    state.orphanMappings ||= []
    state.versions ||= []
    state.annotations ||= []
    state.features ||= []
    state.paragraphs ||= []
    state.claims ||= []
    if (!state.caseId) state.caseId = fallback.caseId
    if (!state.caseName) state.caseName = fallback.caseName
    state.caseKind ||= fallback.caseKind
    state.activeTab ||= fallback.activeTab
    return state
  }

  private withPosition(state: WorkbenchState): WorkbenchState {
    if (typeof localStorage === 'undefined') return state
    try {
      const stored = JSON.parse(localStorage.getItem(this.positionKey(state.caseId)) || '{}') as Partial<Position>
      if (stored.tab) state.activeTab = stored.tab
      if (stored.tab === 'split' && state.handoffStatus === 'linked') state.activeTab = 'reconciliation'
      if (stored.claimId && state.claims.some(claim => claim.id === stored.claimId)) state.selectedClaimId = stored.claimId
      if (stored.featureId && state.features.some(feature => feature.id === stored.featureId)) state.selectedFeatureId = stored.featureId
    } catch { /* keep persisted tab and selection */ }
    return state
  }

  private upsertRecord(record: CaseSummary): void {
    const index = this.caseRecords.findIndex(item => item.id === record.id)
    if (index >= 0) this.caseRecords[index] = record
    else this.caseRecords.push(record)
    this.caseRecords.sort((a, b) => a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === 'parent' ? -1 : 1)
    this.casesSubject.next(clone(this.caseRecords))
    if (typeof localStorage !== 'undefined') localStorage.setItem(REGISTRY_KEY, JSON.stringify(this.caseRecords))
  }
}
