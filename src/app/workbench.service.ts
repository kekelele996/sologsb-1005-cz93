import { Injectable, OnDestroy } from '@angular/core'
import { BehaviorSubject, map, type Observable } from 'rxjs'
import type { Annotation, CaseSlice, Claim, DivisionalCase, Feature, Paragraph, PendingBasis, Position, Role, ValidationIssue, WorkbenchState } from './models'

const STORAGE_KEY = 'patent-claim-mapping-workbench-v1'
const POSITION_KEY = 'patent-claim-mapping-position-v1'
const PARENT_CASE_ID = 'parent'

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
function demoState(): WorkbenchState {
  const slice: CaseSlice = {
    claims: initialClaims, paragraphs: initialParagraphs, features: initialFeatures,
    annotations: initialAnnotations, orphanMappings: [], versions: [],
    selectedClaimId: 'claim-1', selectedFeatureId: 'feature-b', activeTab: 'mapping'
  }
  return {
    ...slice,
    role: 'author', currentUserRole: 'author',
    activeCaseId: PARENT_CASE_ID, parentSlice: slice, divisionalCases: []
  }
}
function clone<T>(value: T): T { return structuredClone(value) }
function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }

@Injectable({ providedIn: 'root' })
export class WorkbenchService implements OnDestroy {
  private readonly initialState = this.loadState()
  private readonly stateSubject = new BehaviorSubject<WorkbenchState>(this.initialState)
  private readonly historySubject = new BehaviorSubject<{ past: number; future: number }>({ past: 0, future: 0 })
  private historyByCase: Record<string, { past: WorkbenchState[]; future: WorkbenchState[] }> = {}

  readonly state$ = this.stateSubject.asObservable()
  readonly history$ = this.historySubject.asObservable()
  readonly claims$ = this.state$.pipe(map(state => state.claims))
  readonly paragraphs$ = this.state$.pipe(map(state => state.paragraphs))
  readonly features$ = this.state$.pipe(map(state => state.features))
  readonly annotations$ = this.state$.pipe(map(state => state.annotations))
  readonly role$ = this.state$.pipe(map(state => state.role))
  readonly activeCaseId$ = this.state$.pipe(map(state => state.activeCaseId))
  readonly divisionalCases$ = this.state$.pipe(map(state => state.divisionalCases))
  readonly activeDivisional$ = this.state$.pipe(map(state => state.divisionalCases.find(item => item.id === state.activeCaseId) || null))
  readonly selectedClaim$ = this.state$.pipe(map(state => state.claims.find(claim => claim.id === state.selectedClaimId) || state.claims[0]))
  readonly selectedFeature$ = this.state$.pipe(map(state => state.features.find(feature => feature.id === state.selectedFeatureId) || null))
  readonly issues$ = this.state$.pipe(map(state => this.validate(state)))

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.savePosition())
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', () => this.savePosition())
  }

  get snapshot(): WorkbenchState { return clone(this.stateSubject.value) }
  get canUndo(): boolean { return this.historyFor(this.stateSubject.value.activeCaseId).past.length > 0 }
  get canRedo(): boolean { return this.historyFor(this.stateSubject.value.activeCaseId).future.length > 0 }

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
      if (state.activeCaseId !== PARENT_CASE_ID) this.reconcileDraft(state, state.activeCaseId)
    })
  }

  deleteParagraph(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      if (state.activeCaseId === PARENT_CASE_ID) {
        state.paragraphs = state.paragraphs.filter(item => item.id !== id)
        state.features.forEach(feature => { feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== id) })
        state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== id)
        return
      }
      const divisional = this.findDivisional(state, state.activeCaseId)
      if (!divisional) return
      divisional.slice.paragraphs = divisional.slice.paragraphs.filter(item => item.id !== id)
      divisional.slice.features.forEach(feature => {
        if (!feature.supportIds.includes(id)) return
        feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== id)
        this.pushPending(divisional, {
          featureId: feature.id, featureLabel: feature.label, paragraphId: id, paragraphSection: '已删除段落',
          reason: '段落已从分案说明书移除，编号对不上；依据先退回待确认，不指向分案中不存在的段落。'
        })
      })
      divisional.slice.orphanMappings = divisional.slice.orphanMappings.filter(item => item.paragraphId !== id)
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
      state.selectedFeatureId = state.features.find(item => item.claimId === state.selectedClaimId)?.id || null
    })
  }

  toggleParagraphMapping(featureId: string, paragraphId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === featureId)
      if (!feature) return
      const index = feature.supportIds.indexOf(paragraphId)
      if (index >= 0) feature.supportIds.splice(index, 1)
      else feature.supportIds.push(paragraphId)
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

  undo(): void {
    const history = this.historyFor(this.stateSubject.value.activeCaseId)
    const previous = history.past.pop()
    if (!previous) return
    history.future.push(clone(this.stateSubject.value))
    this.stateSubject.next(previous)
    this.updateHistory()
    this.saveState()
  }

  redo(): void {
    const history = this.historyFor(this.stateSubject.value.activeCaseId)
    const next = history.future.pop()
    if (!next) return
    history.past.push(clone(this.stateSubject.value))
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  savePosition(): void {
    if (typeof localStorage === 'undefined') return
    const state = this.stateSubject.value
    const position: Position = { tab: state.activeTab, claimId: state.selectedClaimId, featureId: state.selectedFeatureId, scrollY: window.scrollY, caseId: state.activeCaseId }
    localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    this.saveState()
  }

  readPosition(): Position {
    const fallback: Position = { tab: 'mapping', claimId: this.initialState.selectedClaimId, featureId: this.initialState.selectedFeatureId, scrollY: 0, caseId: PARENT_CASE_ID }
    if (typeof localStorage === 'undefined') return fallback
    try {
      const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || '{}')
      return { ...fallback, ...parsed }
    } catch { return fallback }
  }

  exportJson(): string { return JSON.stringify({ ...this.snapshot, validationIssues: this.validate(this.stateSubject.value) }, null, 2) }

  exportCsv(): string {
    const state = this.stateSubject.value
    const rows = state.features.map(feature => [
      state.claims.find(claim => claim.id === feature.claimId)?.number || '', feature.label, feature.text,
      state.features.find(item => item.id === feature.parentId)?.label || '',
      feature.referenceIds.map(id => state.features.find(item => item.id === id)?.label || id).join('；'),
      feature.supportIds.map(id => state.paragraphs.find(item => item.id === id)?.section || id).join('；')
    ])
    const csv = [['权利要求', '技术特征', '特征内容', '父级特征', '引用特征', '支持段落'], ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    return `\uFEFF${csv}`
  }

  validate(state = this.stateSubject.value): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const feature of state.features) {
      if (!feature.text.trim()) issues.push({ id: `empty-${feature.id}`, severity: 'warning', type: 'empty-feature', featureId: feature.id, title: `${feature.label} 内容为空`, detail: '请补全技术特征文字，避免映射对象不明确。' })
      if (!feature.supportIds.length) issues.push({ id: `support-${feature.id}`, severity: 'error', type: 'missing-support', featureId: feature.id, title: `${feature.label} 缺少说明书依据`, detail: '至少为一个说明书段落建立支持映射。' })
      if (this.hasReferenceCycle(feature, state.features)) issues.push({ id: `cycle-${feature.id}`, severity: 'error', type: 'cycle', featureId: feature.id, title: `${feature.label} 存在循环引用`, detail: '特征层级或引用关系形成闭环，请移除其中一条关系。' })
    }
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

  // ── 分案管理 ──────────────────────────────────────────────

  get isDivisionalActive(): boolean { return this.stateSubject.value.activeCaseId !== PARENT_CASE_ID }

  activateCase(caseId: string): void {
    const state = this.stateSubject.value
    if (caseId === state.activeCaseId) return
    this.patchState(next => {
      this.stashSlice(next)
      next.activeCaseId = caseId
      const slice = this.resolveSlice(next, caseId)
      if (slice) {
        next.claims = slice.claims
        next.paragraphs = slice.paragraphs
        next.features = slice.features
        next.annotations = slice.annotations
        next.orphanMappings = slice.orphanMappings
        next.versions = slice.versions
        next.selectedClaimId = slice.selectedClaimId
        next.selectedFeatureId = slice.selectedFeatureId
        next.activeTab = slice.activeTab
      }
    })
    this.updateHistory()
    this.savePosition()
  }

  createDivisional(claimIds: string[]): { ok: boolean; reason?: string; existingId?: string; divisionalId?: string } {
    if (this.stateSubject.value.role === 'viewer') return { ok: false, reason: 'forbidden' }
    const parent = this.stateSubject.value.parentSlice
    const splitKey = claimIds.slice().sort((a, b) => {
      const na = parent.claims.find(claim => claim.id === a)?.number ?? 0
      const nb = parent.claims.find(claim => claim.id === b)?.number ?? 0
      return na - nb
    }).join('|')
    const existing = this.stateSubject.value.divisionalCases.find(item => item.splitKey === splitKey)
    if (existing) return { ok: false, reason: 'duplicate', existingId: existing.id }

    const id = `divisional-${Date.now()}`
    const selectedClaimIds = new Set(claimIds)
    const featureIdSet = new Set(parent.features.filter(feature => selectedClaimIds.has(feature.claimId)).map(feature => feature.id))
    let grew = true
    while (grew) {
      grew = false
      for (const feature of parent.features) {
        if (!featureIdSet.has(feature.id)) continue
        for (const ref of [feature.parentId, ...feature.referenceIds].filter((value): value is string => !!value)) {
          if (!featureIdSet.has(ref)) { featureIdSet.add(ref); grew = true }
        }
      }
    }
    const features = clone(parent.features.filter(feature => featureIdSet.has(feature.id)))
    const claimIdsUsed = new Set(features.map(feature => feature.claimId))
    const claims = clone(parent.claims.filter(claim => claimIdsUsed.has(claim.id)))
    const paragraphs = clone(parent.paragraphs)
    const annotations = clone(parent.annotations.filter(annotation => featureIdSet.has(annotation.featureId)))
    const slice: CaseSlice = {
      claims, paragraphs, features, annotations, orphanMappings: [], versions: [],
      selectedClaimId: claims[0]?.id || '', selectedFeatureId: features[0]?.id || null, activeTab: 'mapping'
    }
    const index = this.stateSubject.value.divisionalCases.length + 1
    const divisional: DivisionalCase = {
      id, name: `分案 D${index}`, parentCaseId: PARENT_CASE_ID, splitKey, claimIds: claimIds.slice(),
      createdAt: new Date().toISOString(), handoffStatus: 'idle', handoffAttempts: 0, pendingBasis: [], slice
    }
    this.commit(state => { state.divisionalCases.push(divisional) })
    this.activateCase(id)
    void this.runHandoff(id)
    return { ok: true, divisionalId: id }
  }

  retryHandoff(divisionalId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    void this.runHandoff(divisionalId)
  }

  reconcileDivisional(): { pending: number } {
    if (this.stateSubject.value.role === 'viewer') return { pending: 0 }
    let pending = 0
    this.commit(state => {
      if (state.activeCaseId === PARENT_CASE_ID) return
      pending = this.reconcileDraft(state, state.activeCaseId)
    })
    return { pending }
  }

  resolvePendingBasis(pendingId: string, action: 'repoint' | 'discard', paragraphId?: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const divisional = this.findDivisional(state, state.activeCaseId)
      if (!divisional) return
      const item = divisional.pendingBasis.find(entry => entry.id === pendingId)
      if (!item || item.status !== 'pending') return
      if (action === 'discard') {
        item.status = 'discarded'
        item.resolution = 'discarded'
        return
      }
      if (!paragraphId) return
      const feature = divisional.slice.features.find(entry => entry.id === item.featureId)
      if (!feature) return
      if (!feature.supportIds.includes(paragraphId)) feature.supportIds.push(paragraphId)
      item.status = 'resolved'
      item.resolution = 'repointed'
      item.repointedTo = paragraphId
    })
  }

  private async runHandoff(divisionalId: string): Promise<void> {
    await delay(350)
    const divisional = this.stateSubject.value.divisionalCases.find(item => item.id === divisionalId)
    if (!divisional) return
    if (divisional.handoffAttempts === 0) {
      this.commit(state => {
        const target = this.findDivisional(state, divisionalId)
        if (!target) return
        target.handoffStatus = 'running'
        target.handoffAttempts = 1
      })
      await delay(700)
      this.commit(state => {
        const target = this.findDivisional(state, divisionalId)
        if (!target) return
        target.handoffStatus = 'failed'
        target.handoffError = '衔接中断：分案说明书库接收未完成。可从分案这一侧重试衔接，已带入的特征与批注不会丢失。'
      })
      return
    }
    this.commit(state => {
      const target = this.findDivisional(state, divisionalId)
      if (!target) return
      target.handoffStatus = 'running'
      target.handoffAttempts += 1
    })
    await delay(700)
    this.commit(state => {
      const target = this.findDivisional(state, divisionalId)
      if (!target) return
      target.handoffStatus = 'done'
      target.handoffError = undefined
      this.reconcileDraft(state, divisionalId)
    })
  }

  private reconcileDraft(state: WorkbenchState, divisionalId: string): number {
    const divisional = this.findDivisional(state, divisionalId)
    if (!divisional) return 0
    let newlyPending = 0
    for (const feature of divisional.slice.features) {
      const kept: string[] = []
      for (const paragraphId of feature.supportIds) {
        const divParagraph = divisional.slice.paragraphs.find(item => item.id === paragraphId)
        const parentParagraph = state.parentSlice.paragraphs.find(item => item.id === paragraphId)
        let reason = ''
        if (!divParagraph) reason = '段落已从分案说明书移除，编号对不上。'
        else if (parentParagraph && divParagraph.section !== parentParagraph.section) reason = '段落编号与母案对不上。'
        else if (parentParagraph && divParagraph.text !== parentParagraph.text) reason = '说明书正文与母案不一致。'
        if (reason) {
          const exists = divisional.pendingBasis.some(item => item.featureId === feature.id && item.paragraphId === paragraphId && item.status === 'pending')
          if (!exists) {
            divisional.pendingBasis.push({
              id: `pending-${Date.now()}-${feature.id}-${paragraphId}`,
              featureId: feature.id, featureLabel: feature.label,
              paragraphId, paragraphSection: parentParagraph?.section || '编号缺失',
              reason, status: 'pending'
            })
            newlyPending += 1
          }
        } else kept.push(paragraphId)
      }
      feature.supportIds = kept
    }
    return newlyPending
  }

  private pushPending(divisional: DivisionalCase, entry: Omit<PendingBasis, 'id' | 'status'>): void {
    const exists = divisional.pendingBasis.some(item => item.featureId === entry.featureId && item.paragraphId === entry.paragraphId && item.status === 'pending')
    if (exists) return
    divisional.pendingBasis.push({ ...entry, id: `pending-${Date.now()}-${entry.featureId}-${entry.paragraphId}`, status: 'pending' })
  }

  private findDivisional(state: WorkbenchState, divisionalId: string): DivisionalCase | undefined {
    return state.divisionalCases.find(item => item.id === divisionalId)
  }

  private resolveSlice(state: WorkbenchState, caseId: string): CaseSlice | undefined {
    if (caseId === PARENT_CASE_ID) return state.parentSlice
    return this.findDivisional(state, caseId)?.slice
  }

  private stashSlice(state: WorkbenchState): void {
    const slice: CaseSlice = {
      claims: state.claims, paragraphs: state.paragraphs, features: state.features,
      annotations: state.annotations, orphanMappings: state.orphanMappings, versions: state.versions,
      selectedClaimId: state.selectedClaimId, selectedFeatureId: state.selectedFeatureId, activeTab: state.activeTab
    }
    if (state.activeCaseId === PARENT_CASE_ID) state.parentSlice = slice
    else {
      const divisional = this.findDivisional(state, state.activeCaseId)
      if (divisional) divisional.slice = slice
    }
  }

  private historyFor(caseId: string): { past: WorkbenchState[]; future: WorkbenchState[] } {
    if (!this.historyByCase[caseId]) this.historyByCase[caseId] = { past: [], future: [] }
    return this.historyByCase[caseId]
  }

  private commit(recipe: (state: WorkbenchState) => void): void {
    const current = clone(this.stateSubject.value)
    const next = clone(current)
    recipe(next)
    const history = this.historyFor(next.activeCaseId)
    history.past.push(current)
    if (history.past.length > 60) history.past.shift()
    history.future = []
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

  private updateHistory(): void {
    const history = this.historyFor(this.stateSubject.value.activeCaseId)
    this.historySubject.next({ past: history.past.length, future: history.future.length })
  }
  private saveState(): void { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stateSubject.value)) }
  private loadState(): WorkbenchState {
    if (typeof localStorage === 'undefined') return demoState()
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return demoState()
      const parsed = JSON.parse(stored)
      const demo = demoState()
      if (!parsed.parentSlice) {
        parsed.parentSlice = {
          claims: parsed.claims ?? demo.parentSlice.claims,
          paragraphs: parsed.paragraphs ?? demo.parentSlice.paragraphs,
          features: parsed.features ?? demo.parentSlice.features,
          annotations: parsed.annotations ?? demo.parentSlice.annotations,
          orphanMappings: parsed.orphanMappings ?? [],
          versions: parsed.versions ?? [],
          selectedClaimId: parsed.selectedClaimId ?? demo.parentSlice.selectedClaimId,
          selectedFeatureId: parsed.selectedFeatureId ?? demo.parentSlice.selectedFeatureId,
          activeTab: parsed.activeTab ?? 'mapping'
        }
        parsed.activeCaseId = PARENT_CASE_ID
        parsed.divisionalCases = []
      }
      return { ...demo, ...parsed }
    } catch { return demoState() }
  }
}
